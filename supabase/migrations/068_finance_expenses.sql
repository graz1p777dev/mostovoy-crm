-- ─── 068: Финансы, шаг 1 — расходы (категории + расходы) ───────────────────────
--
-- Управленческая структура расходов по 6 смысловым категориям (редактируемый справочник,
-- как partner_types). Расходы вводятся в KGS или USD; при USD хранится курс, сомовый
-- эквивалент — GENERATED. Категория «Зарплаты/ФОТ» — ПРОИЗВОДНАЯ (is_derived): сумма не
-- вводится вручную, а берётся из раздела Зарплата (SUM salaries.total_amount за месяц).
-- Категория «Себестоимость» имеет source_mode ('manual'|'inventory'); пока только manual
-- (задел под товароучёт брата). RLS — permissions-driven по ресурсу finances (уже в RBAC).
-- Управляющие операции (категории) — только управляющий финансов (edit + scope team/all =
-- owner + бухгалтер), зеркало _assert_marketing_manager.

-- ── Справочник категорий ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.expense_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  is_system   boolean NOT NULL DEFAULT false,   -- базовые нельзя удалить
  is_derived  boolean NOT NULL DEFAULT false,   -- сумма из другого раздела (ФОТ ← Зарплата), ручной ввод запрещён
  source_mode text NOT NULL DEFAULT 'manual' CHECK (source_mode IN ('manual','inventory')),  -- задел: себестоимость из товароучёта
  sort_order  integer NOT NULL DEFAULT 100,
  created_by  uuid REFERENCES public.employees(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_expense_categories_name ON public.expense_categories (lower(name)) WHERE deleted_at IS NULL;

REVOKE ALL ON TABLE public.expense_categories FROM anon, authenticated;
GRANT SELECT ON TABLE public.expense_categories TO authenticated;
GRANT ALL    ON TABLE public.expense_categories TO service_role;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS expense_categories_select_by_perm ON public.expense_categories;
CREATE POLICY expense_categories_select_by_perm ON public.expense_categories FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND (SELECT public._my_perm_scope('finances')) IS NOT NULL);

INSERT INTO public.expense_categories (name, is_system, is_derived, source_mode, sort_order)
SELECT v.name, true, v.derived, v.mode, v.ord FROM (VALUES
  ('Себестоимость товара', false, 'manual', 10),
  ('Маркетинг',            false, 'manual', 20),
  ('Зарплаты / ФОТ',       true,  'manual', 30),
  ('Аренда и содержание',  false, 'manual', 40),
  ('Сервисы / подписки',   false, 'manual', 50),
  ('Прочее',               false, 'manual', 99)
) AS v(name, derived, mode, ord)
WHERE NOT EXISTS (SELECT 1 FROM public.expense_categories c WHERE lower(c.name)=lower(v.name) AND c.deleted_at IS NULL);

-- ── Расходы ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.expenses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id     uuid NOT NULL REFERENCES public.expense_categories(id),
  name            text NOT NULL,                       -- статья/название
  amount_original numeric NOT NULL CHECK (amount_original > 0),
  currency        text NOT NULL DEFAULT 'KGS' CHECK (currency IN ('KGS','USD')),
  rate            numeric NOT NULL DEFAULT 1 CHECK (rate > 0),  -- сом за 1 ед. валюты; KGS=1
  amount_som      numeric GENERATED ALWAYS AS (amount_original * rate) STORED,
  expense_date    date NOT NULL,
  is_recurring    boolean NOT NULL DEFAULT false,       -- ежемесячный (переносим в новый месяц)
  period_month    date NOT NULL,                        -- первый день учётного месяца (напр. 2026-07-01)
  created_by      uuid REFERENCES public.employees(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  -- Валюта/курс: KGS ⇒ rate=1; USD ⇒ курс реальный (>1 обычно). Позитивность — CHECK rate>0.
  CONSTRAINT expenses_kgs_rate_one CHECK (currency <> 'KGS' OR rate = 1)
);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON public.expenses (category_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_period   ON public.expenses (period_month) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_date     ON public.expenses (expense_date) WHERE deleted_at IS NULL;

REVOKE ALL ON TABLE public.expenses FROM anon, authenticated;
GRANT SELECT ON TABLE public.expenses TO authenticated;
GRANT ALL    ON TABLE public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS expenses_select_by_perm ON public.expenses;
CREATE POLICY expenses_select_by_perm ON public.expenses FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND (SELECT public._my_perm_scope('finances')) IS NOT NULL);

-- ── Управляющий финансов (edit + scope team/all) — зеркало _marketing_manage_ok ─
CREATE OR REPLACE FUNCTION public._finances_manage_ok(p_actor uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE(bool_or(p.can_edit AND p.scope IN ('team','all')), false)
  FROM public.employees e
  JOIN public.roles r       ON r.name = e.role AND r.deleted_at IS NULL
  JOIN public.permissions p ON p.role_id = r.id AND p.resource = 'finances'
  WHERE e.id = p_actor AND e.deleted_at IS NULL AND e.status IN ('active','probation');
$$;
REVOKE ALL ON FUNCTION public._finances_manage_ok(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._finances_manage_ok(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public._assert_finances_manager(p_actor uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT public._finances_manage_ok(p_actor) THEN RAISE EXCEPTION 'not_finances_manager'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public._assert_finances_manager(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._assert_finances_manager(uuid) TO service_role;

-- ── save_expense (insert/update) — аудит; валюта/курс/производная категория ─────
CREATE OR REPLACE FUNCTION public.save_expense(p_id uuid, p_data jsonb, p_actor uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_id uuid; v_old jsonb; v_new jsonb;
  v_cat uuid; v_cur text; v_rate numeric; v_amt numeric; v_derived boolean;
BEGIN
  PERFORM public._assert_actor_active(p_actor);

  v_cat  := NULLIF(p_data->>'category_id','')::uuid;
  v_cur  := COALESCE(p_data->>'currency','KGS');
  v_rate := COALESCE((p_data->>'rate')::numeric, 1);
  v_amt  := COALESCE((p_data->>'amount_original')::numeric, 0);

  IF v_cat IS NULL THEN RAISE EXCEPTION 'category_required'; END IF;
  SELECT is_derived INTO v_derived FROM public.expense_categories WHERE id = v_cat AND deleted_at IS NULL;
  IF v_derived IS NULL THEN RAISE EXCEPTION 'category_not_found'; END IF;
  IF v_derived THEN RAISE EXCEPTION 'category_is_derived'; END IF;         -- ФОТ считается из Зарплаты
  IF v_cur NOT IN ('KGS','USD') THEN RAISE EXCEPTION 'invalid_currency'; END IF;
  IF v_cur = 'KGS' THEN v_rate := 1; END IF;
  IF v_rate <= 0 THEN RAISE EXCEPTION 'invalid_rate'; END IF;
  IF v_amt <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.expenses (category_id, name, amount_original, currency, rate, expense_date, is_recurring, period_month, created_by)
    VALUES (v_cat, p_data->>'name', v_amt, v_cur, v_rate,
            (p_data->>'expense_date')::date, COALESCE((p_data->>'is_recurring')::boolean,false),
            (p_data->>'period_month')::date, p_actor)
    RETURNING id INTO v_id;
    SELECT to_jsonb(e.*) INTO v_new FROM public.expenses e WHERE e.id = v_id;
    INSERT INTO public.audit_logs (employee_id, action, resource_type, resource_id, new_data)
    VALUES (p_actor, 'create', 'expenses', v_id, v_new);
  ELSE
    SELECT to_jsonb(e.*) INTO v_old FROM public.expenses e WHERE e.id = p_id AND e.deleted_at IS NULL FOR UPDATE;
    IF v_old IS NULL THEN RAISE EXCEPTION 'expense_not_found'; END IF;
    UPDATE public.expenses SET
      category_id=v_cat, name=p_data->>'name', amount_original=v_amt, currency=v_cur, rate=v_rate,
      expense_date=(p_data->>'expense_date')::date, is_recurring=COALESCE((p_data->>'is_recurring')::boolean,false),
      period_month=(p_data->>'period_month')::date
    WHERE id=p_id;
    v_id := p_id;
    SELECT to_jsonb(e.*) INTO v_new FROM public.expenses e WHERE e.id = v_id;
    INSERT INTO public.audit_logs (employee_id, action, resource_type, resource_id, old_data, new_data)
    VALUES (p_actor, 'update', 'expenses', v_id, v_old, v_new);
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.save_expense(uuid, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_expense(uuid, jsonb, uuid) TO service_role;

-- ── delete_expense (soft) + аудит ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_expense(p_id uuid, p_actor uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_old jsonb;
BEGIN
  PERFORM public._assert_actor_active(p_actor);
  SELECT to_jsonb(e.*) INTO v_old FROM public.expenses e WHERE e.id = p_id AND e.deleted_at IS NULL FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'expense_not_found'; END IF;
  UPDATE public.expenses SET deleted_at = now() WHERE id = p_id;
  INSERT INTO public.audit_logs (employee_id, action, resource_type, resource_id, old_data)
  VALUES (p_actor, 'delete', 'expenses', p_id, v_old);
END;
$$;
REVOKE ALL ON FUNCTION public.delete_expense(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_expense(uuid, uuid) TO service_role;

-- ── save_expense_category / delete_expense_category — только управляющий финансов ─
CREATE OR REPLACE FUNCTION public.save_expense_category(p_id uuid, p_name text, p_actor uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_id uuid; v_old jsonb;
BEGIN
  PERFORM public._assert_actor_active(p_actor);
  PERFORM public._assert_finances_manager(p_actor);
  IF p_name IS NULL OR btrim(p_name) = '' THEN RAISE EXCEPTION 'empty_name'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.expense_categories (name, is_system, created_by) VALUES (btrim(p_name), false, p_actor) RETURNING id INTO v_id;
    INSERT INTO public.audit_logs (employee_id, action, resource_type, resource_id, new_data)
    VALUES (p_actor, 'create', 'expense_categories', v_id, jsonb_build_object('name', btrim(p_name)));
  ELSE
    SELECT to_jsonb(c.*) INTO v_old FROM public.expense_categories c WHERE c.id = p_id AND c.deleted_at IS NULL FOR UPDATE;
    IF v_old IS NULL THEN RAISE EXCEPTION 'category_not_found'; END IF;
    UPDATE public.expense_categories SET name = btrim(p_name) WHERE id = p_id;
    v_id := p_id;
    INSERT INTO public.audit_logs (employee_id, action, resource_type, resource_id, old_data, new_data)
    VALUES (p_actor, 'update', 'expense_categories', v_id, v_old, jsonb_build_object('name', btrim(p_name)));
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.save_expense_category(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_expense_category(uuid, text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.delete_expense_category(p_id uuid, p_actor uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_old jsonb; v_used integer;
BEGIN
  PERFORM public._assert_actor_active(p_actor);
  PERFORM public._assert_finances_manager(p_actor);
  SELECT to_jsonb(c.*) INTO v_old FROM public.expense_categories c WHERE c.id = p_id AND c.deleted_at IS NULL FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'category_not_found'; END IF;
  IF (v_old->>'is_system')::boolean THEN RAISE EXCEPTION 'system_category_protected'; END IF;
  SELECT count(*) INTO v_used FROM public.expenses WHERE category_id = p_id AND deleted_at IS NULL;
  IF v_used > 0 THEN RAISE EXCEPTION 'category_in_use'; END IF;
  UPDATE public.expense_categories SET deleted_at = now() WHERE id = p_id;
  INSERT INTO public.audit_logs (employee_id, action, resource_type, resource_id, old_data)
  VALUES (p_actor, 'delete', 'expense_categories', p_id, v_old);
END;
$$;
REVOKE ALL ON FUNCTION public.delete_expense_category(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_expense_category(uuid, uuid) TO service_role;

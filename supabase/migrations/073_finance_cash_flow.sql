-- ─── 073: Финансы, шаг 7 (финал) — движение денег (ДДС / Cash Flow) ───────────
--
-- Учёт РЕАЛЬНЫХ денег по счетам (не прибыль на бумаге, а сколько физически есть) +
-- предупреждение о кассовом разрыве. Третий кит управленческого учёта (после P&L и
-- распределения). Модель денег (валюта/курс/amount_som) — как в expenses/debts/investors.
-- RLS permissions-driven по finances. Запись — управляющий финансов (owner/руководитель).
--
-- Задел под авто-связь (шаг будущего): category + linked_ref заложены, чтобы движения могли
-- авто-создаваться из продаж/расходов/выплат инвесторам/погашения долгов. Сейчас — ручной ввод.

-- ── Счета (редактируемый список) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cash_accounts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  account_type text NOT NULL DEFAULT 'bank' CHECK (account_type IN ('cash','bank','other')),
  currency     text NOT NULL DEFAULT 'KGS' CHECK (currency IN ('KGS','USD')),
  is_system    boolean NOT NULL DEFAULT false,        -- базовые нельзя удалить
  sort_order   integer NOT NULL DEFAULT 100,
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
  created_by   uuid REFERENCES public.employees(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);
CREATE INDEX IF NOT EXISTS idx_cash_accounts_active ON public.cash_accounts (sort_order) WHERE deleted_at IS NULL;

REVOKE ALL ON TABLE public.cash_accounts FROM anon, authenticated;
GRANT SELECT ON TABLE public.cash_accounts TO authenticated;
GRANT ALL    ON TABLE public.cash_accounts TO service_role;
ALTER TABLE public.cash_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cash_accounts_select_by_perm ON public.cash_accounts;
CREATE POLICY cash_accounts_select_by_perm ON public.cash_accounts FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND (SELECT public._my_perm_scope('finances')) IS NOT NULL);

INSERT INTO public.cash_accounts (name, account_type, currency, is_system, sort_order)
SELECT v.name, v.t, v.cur, true, v.ord FROM (VALUES
  ('Наличные',           'cash', 'KGS', 10),
  ('М-Банк расчётный',   'bank', 'KGS', 20),
  ('М-Банк обычный',     'bank', 'KGS', 30),
  ('Долларовый счёт',    'bank', 'USD', 40)
) AS v(name, t, cur, ord)
WHERE NOT EXISTS (SELECT 1 FROM public.cash_accounts a WHERE a.deleted_at IS NULL);

-- ── Движения денег ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cash_movements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      uuid NOT NULL REFERENCES public.cash_accounts(id),
  direction       text NOT NULL CHECK (direction IN ('in','out')),
  amount_original numeric NOT NULL CHECK (amount_original > 0),
  currency        text NOT NULL DEFAULT 'KGS' CHECK (currency IN ('KGS','USD')),
  rate            numeric NOT NULL DEFAULT 1 CHECK (rate > 0),
  amount_som      numeric GENERATED ALWAYS AS (amount_original * rate) STORED,
  movement_date   date NOT NULL,
  category        text NOT NULL DEFAULT 'other'
                    CHECK (category IN ('revenue','expense','salary','debt_repayment','investor_payout','transfer','other')),
  linked_ref      text,                                -- задел: ссылка на источник (продажа/долг/инвестор…)
  note            text,
  created_by      uuid REFERENCES public.employees(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  CONSTRAINT cash_movements_kgs_rate_one CHECK (currency <> 'KGS' OR rate = 1)
);
CREATE INDEX IF NOT EXISTS idx_cash_mov_account   ON public.cash_movements (account_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cash_mov_date      ON public.cash_movements (movement_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cash_mov_direction ON public.cash_movements (direction) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cash_mov_category  ON public.cash_movements (category) WHERE deleted_at IS NULL;

REVOKE ALL ON TABLE public.cash_movements FROM anon, authenticated;
GRANT SELECT ON TABLE public.cash_movements TO authenticated;
GRANT ALL    ON TABLE public.cash_movements TO service_role;
ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cash_movements_select_by_perm ON public.cash_movements;
CREATE POLICY cash_movements_select_by_perm ON public.cash_movements FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND (SELECT public._my_perm_scope('finances')) IS NOT NULL);

-- ── save_cash_account (insert/update) ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.save_cash_account(p_id uuid, p_data jsonb, p_actor uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_id uuid; v_old jsonb; v_type text; v_cur text; v_status text;
BEGIN
  PERFORM public._assert_actor_active(p_actor);
  PERFORM public._assert_finances_manager(p_actor);
  v_type   := COALESCE(p_data->>'account_type','bank');
  v_cur    := COALESCE(p_data->>'currency','KGS');
  v_status := COALESCE(NULLIF(p_data->>'status',''),'active');
  IF (p_data->>'name') IS NULL OR btrim(p_data->>'name') = '' THEN RAISE EXCEPTION 'name_required'; END IF;
  IF v_type NOT IN ('cash','bank','other') THEN RAISE EXCEPTION 'invalid_account_type'; END IF;
  IF v_cur NOT IN ('KGS','USD') THEN RAISE EXCEPTION 'invalid_currency'; END IF;
  IF v_status NOT IN ('active','closed') THEN RAISE EXCEPTION 'invalid_status'; END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.cash_accounts (name, account_type, currency, status, sort_order, created_by)
    VALUES (btrim(p_data->>'name'), v_type, v_cur, v_status, COALESCE((p_data->>'sort_order')::integer, 100), p_actor)
    RETURNING id INTO v_id;
    INSERT INTO public.audit_logs (employee_id, action, resource_type, resource_id, new_data)
    VALUES (p_actor, 'create', 'cash_accounts', v_id, (SELECT to_jsonb(a.*) FROM public.cash_accounts a WHERE a.id = v_id));
  ELSE
    SELECT to_jsonb(a.*) INTO v_old FROM public.cash_accounts a WHERE a.id = p_id AND a.deleted_at IS NULL FOR UPDATE;
    IF v_old IS NULL THEN RAISE EXCEPTION 'account_not_found'; END IF;
    -- Системный счёт: имя/тип/валюту не меняем (только статус/сортировку — чтобы можно было закрыть).
    IF (v_old->>'is_system')::boolean THEN
      UPDATE public.cash_accounts SET status = v_status, sort_order = COALESCE((p_data->>'sort_order')::integer, sort_order) WHERE id = p_id;
    ELSE
      UPDATE public.cash_accounts SET name = btrim(p_data->>'name'), account_type = v_type, currency = v_cur,
        status = v_status, sort_order = COALESCE((p_data->>'sort_order')::integer, sort_order) WHERE id = p_id;
    END IF;
    v_id := p_id;
    INSERT INTO public.audit_logs (employee_id, action, resource_type, resource_id, old_data, new_data)
    VALUES (p_actor, 'update', 'cash_accounts', v_id, v_old, (SELECT to_jsonb(a.*) FROM public.cash_accounts a WHERE a.id = v_id));
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.save_cash_account(uuid, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_cash_account(uuid, jsonb, uuid) TO service_role;

-- ── delete_cash_account (soft) — системный защищён, с движениями нельзя ────────
CREATE OR REPLACE FUNCTION public.delete_cash_account(p_id uuid, p_actor uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_old jsonb; v_used integer;
BEGIN
  PERFORM public._assert_actor_active(p_actor);
  PERFORM public._assert_finances_manager(p_actor);
  SELECT to_jsonb(a.*) INTO v_old FROM public.cash_accounts a WHERE a.id = p_id AND a.deleted_at IS NULL FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'account_not_found'; END IF;
  IF (v_old->>'is_system')::boolean THEN RAISE EXCEPTION 'system_account_protected'; END IF;
  SELECT count(*) INTO v_used FROM public.cash_movements WHERE account_id = p_id AND deleted_at IS NULL;
  IF v_used > 0 THEN RAISE EXCEPTION 'account_in_use'; END IF;
  UPDATE public.cash_accounts SET deleted_at = now() WHERE id = p_id;
  INSERT INTO public.audit_logs (employee_id, action, resource_type, resource_id, old_data)
  VALUES (p_actor, 'delete', 'cash_accounts', p_id, v_old);
END;
$$;
REVOKE ALL ON FUNCTION public.delete_cash_account(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_cash_account(uuid, uuid) TO service_role;

-- ── save_cash_movement (insert/update) ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.save_cash_movement(p_id uuid, p_data jsonb, p_actor uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_id uuid; v_old jsonb; v_acc uuid; v_dir text; v_cur text; v_rate numeric; v_amt numeric; v_cat text;
BEGIN
  PERFORM public._assert_actor_active(p_actor);
  PERFORM public._assert_finances_manager(p_actor);
  v_acc  := NULLIF(p_data->>'account_id','')::uuid;
  v_dir  := COALESCE(p_data->>'direction','');
  v_cur  := COALESCE(p_data->>'currency','KGS');
  v_rate := COALESCE((p_data->>'rate')::numeric, 1);
  v_amt  := COALESCE((p_data->>'amount_original')::numeric, 0);
  v_cat  := COALESCE(p_data->>'category','other');

  IF v_acc IS NULL THEN RAISE EXCEPTION 'account_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cash_accounts WHERE id = v_acc AND deleted_at IS NULL) THEN RAISE EXCEPTION 'account_not_found'; END IF;
  IF v_dir NOT IN ('in','out') THEN RAISE EXCEPTION 'invalid_direction'; END IF;
  IF v_cur NOT IN ('KGS','USD') THEN RAISE EXCEPTION 'invalid_currency'; END IF;
  IF v_cur = 'KGS' THEN v_rate := 1; END IF;
  IF v_rate <= 0 THEN RAISE EXCEPTION 'invalid_rate'; END IF;
  IF v_amt  <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  IF v_cat NOT IN ('revenue','expense','salary','debt_repayment','investor_payout','transfer','other') THEN RAISE EXCEPTION 'invalid_category'; END IF;
  IF (p_data->>'movement_date') IS NULL OR btrim(p_data->>'movement_date') = '' THEN RAISE EXCEPTION 'date_required'; END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.cash_movements (account_id, direction, amount_original, currency, rate, movement_date, category, linked_ref, note, created_by)
    VALUES (v_acc, v_dir, v_amt, v_cur, v_rate, (p_data->>'movement_date')::date, v_cat, NULLIF(p_data->>'linked_ref',''), NULLIF(p_data->>'note',''), p_actor)
    RETURNING id INTO v_id;
    INSERT INTO public.audit_logs (employee_id, action, resource_type, resource_id, new_data)
    VALUES (p_actor, 'create', 'cash_movements', v_id, (SELECT to_jsonb(m.*) FROM public.cash_movements m WHERE m.id = v_id));
  ELSE
    SELECT to_jsonb(m.*) INTO v_old FROM public.cash_movements m WHERE m.id = p_id AND m.deleted_at IS NULL FOR UPDATE;
    IF v_old IS NULL THEN RAISE EXCEPTION 'movement_not_found'; END IF;
    UPDATE public.cash_movements SET account_id=v_acc, direction=v_dir, amount_original=v_amt, currency=v_cur, rate=v_rate,
      movement_date=(p_data->>'movement_date')::date, category=v_cat, linked_ref=NULLIF(p_data->>'linked_ref',''), note=NULLIF(p_data->>'note','')
    WHERE id=p_id;
    v_id := p_id;
    INSERT INTO public.audit_logs (employee_id, action, resource_type, resource_id, old_data, new_data)
    VALUES (p_actor, 'update', 'cash_movements', v_id, v_old, (SELECT to_jsonb(m.*) FROM public.cash_movements m WHERE m.id = v_id));
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.save_cash_movement(uuid, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_cash_movement(uuid, jsonb, uuid) TO service_role;

-- ── delete_cash_movement (soft) + аудит ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_cash_movement(p_id uuid, p_actor uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_old jsonb;
BEGIN
  PERFORM public._assert_actor_active(p_actor);
  PERFORM public._assert_finances_manager(p_actor);
  SELECT to_jsonb(m.*) INTO v_old FROM public.cash_movements m WHERE m.id = p_id AND m.deleted_at IS NULL FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'movement_not_found'; END IF;
  UPDATE public.cash_movements SET deleted_at = now() WHERE id = p_id;
  INSERT INTO public.audit_logs (employee_id, action, resource_type, resource_id, old_data)
  VALUES (p_actor, 'delete', 'cash_movements', p_id, v_old);
END;
$$;
REVOKE ALL ON FUNCTION public.delete_cash_movement(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_cash_movement(uuid, uuid) TO service_role;

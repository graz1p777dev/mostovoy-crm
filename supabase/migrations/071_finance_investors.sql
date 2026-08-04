-- ─── 071: Финансы, шаг 4 — инвесторы (вложения, условия, выплаты) ──────────────
--
-- Учёт инвесторов: кто вложил, на каких условиях, сколько начислено/выплачено, сколько
-- вернуть тела и когда. Модель денег (валюта/курс/сомовый эквивалент) — как в
-- expenses/other_income/debts. RLS permissions-driven по ресурсу finances. Запись —
-- управляющий финансов (_assert_finances_manager: owner/руководитель отдела).
--
-- ЗАМЕНА СТАРОЙ 011: таблицы investors/investor_payouts из миграции 011 (owner-only RLS,
-- бедная схема) на staging ПУСТЫ и в UI не использовались (вкладка была «Скоро»). Здесь они
-- пересоздаются под управленческую модель (типы сделок, условия, реестр выплат). PROD НЕ
-- ТРОГАЕМ — миграция применяется только на staging (staging-first, как 068–070).
--
-- РАЗВЕДЕНИЕ С P&L (чтобы не задвоить):
--   Начисление инвестору (доля прибыли / фикс % / роялти) — это РАСЧЁТНАЯ величина «сколько
--   должны за месяц», НЕ операционный расход в expenses. Тело инвестиции — обязательство
--   (как долг), не расход. Реальные выплаты (investor_payouts) — задел под ДДС и
--   «Распределение прибыли» (будущие шаги). Ни один RPC/экшен не пишет в expenses.

-- ── PREFLIGHT перед DROP (жёсткий, fail-closed) ───────────────────────────────
-- DROP ... CASCADE ниже уничтожает investors/investor_payouts. Это допустимо ТОЛЬКО
-- пока таблицы пусты (старая модель 011 не использовалась) и на них никто не ссылается.
-- Если на целевой БД в них есть данные или внешние FK — миграция ОБЯЗАНА упасть, а не
-- молча снести учёт инвесторов. Проверка inline (не функцией): она должна работать на
-- чистой БД, где хелперов из поздних миграций ещё нет.
DO $preflight$
DECLARE v_rows bigint; v_fk text;
BEGIN
  IF to_regclass('public.investors') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.investors' INTO v_rows;
    IF v_rows > 0 THEN
      RAISE EXCEPTION 'preflight_071_investors_not_empty: % строк в public.investors — DROP отменён', v_rows;
    END IF;
  END IF;
  IF to_regclass('public.investor_payouts') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.investor_payouts' INTO v_rows;
    IF v_rows > 0 THEN
      RAISE EXCEPTION 'preflight_071_payouts_not_empty: % строк в public.investor_payouts — DROP отменён', v_rows;
    END IF;
  END IF;

  -- Внешние FK: CASCADE снёс бы чужие констрейнты вместе с таблицами.
  SELECT string_agg(c.conrelid::regclass::text || '.' || c.conname, ', ') INTO v_fk
  FROM pg_constraint c
  WHERE c.contype = 'f'
    AND c.confrelid IN (COALESCE(to_regclass('public.investors'), 0::oid),
                        COALESCE(to_regclass('public.investor_payouts'), 0::oid))
    AND c.conrelid NOT IN (COALESCE(to_regclass('public.investors'), 0::oid),
                           COALESCE(to_regclass('public.investor_payouts'), 0::oid));
  IF v_fk IS NOT NULL THEN
    RAISE EXCEPTION 'preflight_071_external_fk: на таблицы ссылаются % — DROP отменён', v_fk;
  END IF;
END
$preflight$;

-- Старые пустые таблицы (011) — вниз каскадом (investor_payouts ссылается на investors).
DROP TABLE IF EXISTS public.investor_payouts CASCADE;
DROP TABLE IF EXISTS public.investors CASCADE;

-- ── Справочник типов сделок (редактируемый, как expense_categories/partner_types) ─
CREATE TABLE IF NOT EXISTS public.investor_deal_types (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  is_system   boolean NOT NULL DEFAULT false,   -- базовые нельзя удалить
  sort_order  integer NOT NULL DEFAULT 100,
  created_by  uuid REFERENCES public.employees(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_investor_deal_types_name ON public.investor_deal_types (lower(name)) WHERE deleted_at IS NULL;

REVOKE ALL ON TABLE public.investor_deal_types FROM anon, authenticated;
GRANT SELECT ON TABLE public.investor_deal_types TO authenticated;
GRANT ALL    ON TABLE public.investor_deal_types TO service_role;
ALTER TABLE public.investor_deal_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS investor_deal_types_select_by_perm ON public.investor_deal_types;
CREATE POLICY investor_deal_types_select_by_perm ON public.investor_deal_types FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND (SELECT public._my_perm_scope('finances')) IS NOT NULL);

INSERT INTO public.investor_deal_types (name, is_system, sort_order)
SELECT v.name, true, v.ord FROM (VALUES
  ('Доля от чистой прибыли', 10),
  ('Фиксированный %',        20),
  ('Роялти (% от выручки)',  30),
  ('Смешанный',              40)
) AS v(name, ord)
WHERE NOT EXISTS (SELECT 1 FROM public.investor_deal_types t WHERE lower(t.name)=lower(v.name) AND t.deleted_at IS NULL);

-- ── Инвесторы ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.investors (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  contact           text,
  status            text NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
  amount_original   numeric NOT NULL CHECK (amount_original > 0),
  currency          text NOT NULL DEFAULT 'KGS' CHECK (currency IN ('KGS','USD')),
  rate              numeric NOT NULL DEFAULT 1 CHECK (rate > 0),   -- сом за 1 ед. валюты; KGS=1
  amount_som        numeric GENERATED ALWAYS AS (amount_original * rate) STORED,
  deal_type_id      uuid NOT NULL REFERENCES public.investor_deal_types(id),
  profit_share_pct  numeric CHECK (profit_share_pct IS NULL OR profit_share_pct >= 0),  -- % от чистой прибыли
  fixed_rate_pct    numeric CHECK (fixed_rate_pct   IS NULL OR fixed_rate_pct   >= 0),  -- фикс ставка
  royalty_pct       numeric CHECK (royalty_pct      IS NULL OR royalty_pct      >= 0),  -- % от выручки
  rate_period       text CHECK (rate_period IS NULL OR rate_period IN ('monthly','annual','term')),  -- период фикс-ставки
  start_date        date,                          -- дата начала
  term_months       integer CHECK (term_months IS NULL OR term_months > 0),            -- срок, мес.
  principal_due_date date,                         -- дата возврата тела
  note              text,
  created_by        uuid REFERENCES public.employees(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz,
  CONSTRAINT investors_kgs_rate_one CHECK (currency <> 'KGS' OR rate = 1)
);
CREATE INDEX IF NOT EXISTS idx_investors_status    ON public.investors (status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_investors_deal_type ON public.investors (deal_type_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_investors_due       ON public.investors (principal_due_date) WHERE deleted_at IS NULL;

REVOKE ALL ON TABLE public.investors FROM anon, authenticated;
GRANT SELECT ON TABLE public.investors TO authenticated;
GRANT ALL    ON TABLE public.investors TO service_role;
ALTER TABLE public.investors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS investors_select_by_perm ON public.investors;
CREATE POLICY investors_select_by_perm ON public.investors FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND (SELECT public._my_perm_scope('finances')) IS NOT NULL);

-- ── Реестр выплат инвесторам ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.investor_payouts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investor_id  uuid NOT NULL REFERENCES public.investors(id),
  amount_som   numeric NOT NULL CHECK (amount_som > 0),
  payout_date  date NOT NULL,
  period_month date,                              -- первый день учётного месяца (для доли/процентов)
  payout_type  text NOT NULL DEFAULT 'other' CHECK (payout_type IN ('profit_share','interest','principal_return','other')),
  note         text,
  created_by   uuid REFERENCES public.employees(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);
CREATE INDEX IF NOT EXISTS idx_investor_payouts_investor ON public.investor_payouts (investor_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_investor_payouts_period   ON public.investor_payouts (period_month) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_investor_payouts_date     ON public.investor_payouts (payout_date) WHERE deleted_at IS NULL;

REVOKE ALL ON TABLE public.investor_payouts FROM anon, authenticated;
GRANT SELECT ON TABLE public.investor_payouts TO authenticated;
GRANT ALL    ON TABLE public.investor_payouts TO service_role;
ALTER TABLE public.investor_payouts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS investor_payouts_select_by_perm ON public.investor_payouts;
CREATE POLICY investor_payouts_select_by_perm ON public.investor_payouts FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND (SELECT public._my_perm_scope('finances')) IS NOT NULL);

-- ── save_investor (insert/update) — управляющий финансов + аудит ───────────────
CREATE OR REPLACE FUNCTION public.save_investor(p_id uuid, p_data jsonb, p_actor uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_id uuid; v_old jsonb; v_new jsonb;
  v_cur text; v_rate numeric; v_amt numeric; v_deal uuid; v_period text; v_status text;
BEGIN
  PERFORM public._assert_actor_active(p_actor);
  PERFORM public._assert_finances_manager(p_actor);

  v_cur    := COALESCE(p_data->>'currency','KGS');
  v_rate   := COALESCE((p_data->>'rate')::numeric, 1);
  v_amt    := COALESCE((p_data->>'amount_original')::numeric, 0);
  v_deal   := NULLIF(p_data->>'deal_type_id','')::uuid;
  v_period := NULLIF(p_data->>'rate_period','');
  v_status := COALESCE(NULLIF(p_data->>'status',''),'active');

  IF (p_data->>'name') IS NULL OR btrim(p_data->>'name') = '' THEN RAISE EXCEPTION 'name_required'; END IF;
  IF v_deal IS NULL THEN RAISE EXCEPTION 'deal_type_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.investor_deal_types WHERE id = v_deal AND deleted_at IS NULL) THEN RAISE EXCEPTION 'deal_type_not_found'; END IF;
  IF v_cur NOT IN ('KGS','USD') THEN RAISE EXCEPTION 'invalid_currency'; END IF;
  IF v_cur = 'KGS' THEN v_rate := 1; END IF;
  IF v_rate <= 0 THEN RAISE EXCEPTION 'invalid_rate'; END IF;
  IF v_amt  <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  IF v_status NOT IN ('active','closed') THEN RAISE EXCEPTION 'invalid_status'; END IF;
  IF v_period IS NOT NULL AND v_period NOT IN ('monthly','annual','term') THEN RAISE EXCEPTION 'invalid_rate_period'; END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.investors (name, contact, status, amount_original, currency, rate, deal_type_id,
      profit_share_pct, fixed_rate_pct, royalty_pct, rate_period, start_date, term_months, principal_due_date, note, created_by)
    VALUES (btrim(p_data->>'name'), NULLIF(p_data->>'contact',''), v_status, v_amt, v_cur, v_rate, v_deal,
      NULLIF(p_data->>'profit_share_pct','')::numeric, NULLIF(p_data->>'fixed_rate_pct','')::numeric,
      NULLIF(p_data->>'royalty_pct','')::numeric, v_period,
      NULLIF(p_data->>'start_date','')::date, NULLIF(p_data->>'term_months','')::integer,
      NULLIF(p_data->>'principal_due_date','')::date, NULLIF(p_data->>'note',''), p_actor)
    RETURNING id INTO v_id;
    SELECT to_jsonb(i.*) INTO v_new FROM public.investors i WHERE i.id = v_id;
    INSERT INTO public.audit_logs (employee_id, action, resource_type, resource_id, new_data)
    VALUES (p_actor, 'create', 'investors', v_id, v_new);
  ELSE
    SELECT to_jsonb(i.*) INTO v_old FROM public.investors i WHERE i.id = p_id AND i.deleted_at IS NULL FOR UPDATE;
    IF v_old IS NULL THEN RAISE EXCEPTION 'investor_not_found'; END IF;
    UPDATE public.investors SET
      name=btrim(p_data->>'name'), contact=NULLIF(p_data->>'contact',''), status=v_status,
      amount_original=v_amt, currency=v_cur, rate=v_rate, deal_type_id=v_deal,
      profit_share_pct=NULLIF(p_data->>'profit_share_pct','')::numeric,
      fixed_rate_pct=NULLIF(p_data->>'fixed_rate_pct','')::numeric,
      royalty_pct=NULLIF(p_data->>'royalty_pct','')::numeric, rate_period=v_period,
      start_date=NULLIF(p_data->>'start_date','')::date, term_months=NULLIF(p_data->>'term_months','')::integer,
      principal_due_date=NULLIF(p_data->>'principal_due_date','')::date, note=NULLIF(p_data->>'note','')
    WHERE id=p_id;
    v_id := p_id;
    SELECT to_jsonb(i.*) INTO v_new FROM public.investors i WHERE i.id = v_id;
    INSERT INTO public.audit_logs (employee_id, action, resource_type, resource_id, old_data, new_data)
    VALUES (p_actor, 'update', 'investors', v_id, v_old, v_new);
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.save_investor(uuid, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_investor(uuid, jsonb, uuid) TO service_role;

-- ── delete_investor (soft) + аудит ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_investor(p_id uuid, p_actor uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_old jsonb;
BEGIN
  PERFORM public._assert_actor_active(p_actor);
  PERFORM public._assert_finances_manager(p_actor);
  SELECT to_jsonb(i.*) INTO v_old FROM public.investors i WHERE i.id = p_id AND i.deleted_at IS NULL FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'investor_not_found'; END IF;
  UPDATE public.investors SET deleted_at = now() WHERE id = p_id;
  -- Реестр выплат — тоже мягко гасим (чтобы не висели «сиротами» в отчётах).
  UPDATE public.investor_payouts SET deleted_at = now() WHERE investor_id = p_id AND deleted_at IS NULL;
  INSERT INTO public.audit_logs (employee_id, action, resource_type, resource_id, old_data)
  VALUES (p_actor, 'delete', 'investors', p_id, v_old);
END;
$$;
REVOKE ALL ON FUNCTION public.delete_investor(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_investor(uuid, uuid) TO service_role;

-- ── save_investor_payout (insert/update) — управляющий финансов + аудит ────────
CREATE OR REPLACE FUNCTION public.save_investor_payout(p_id uuid, p_data jsonb, p_actor uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_id uuid; v_old jsonb; v_new jsonb; v_inv uuid; v_amt numeric; v_type text;
BEGIN
  PERFORM public._assert_actor_active(p_actor);
  PERFORM public._assert_finances_manager(p_actor);

  v_inv  := NULLIF(p_data->>'investor_id','')::uuid;
  v_amt  := COALESCE((p_data->>'amount_som')::numeric, 0);
  v_type := COALESCE(p_data->>'payout_type','other');

  IF v_inv IS NULL THEN RAISE EXCEPTION 'investor_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.investors WHERE id = v_inv AND deleted_at IS NULL) THEN RAISE EXCEPTION 'investor_not_found'; END IF;
  IF v_amt <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  IF v_type NOT IN ('profit_share','interest','principal_return','other') THEN RAISE EXCEPTION 'invalid_payout_type'; END IF;
  IF (p_data->>'payout_date') IS NULL OR btrim(p_data->>'payout_date') = '' THEN RAISE EXCEPTION 'payout_date_required'; END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.investor_payouts (investor_id, amount_som, payout_date, period_month, payout_type, note, created_by)
    VALUES (v_inv, v_amt, (p_data->>'payout_date')::date, NULLIF(p_data->>'period_month','')::date, v_type, NULLIF(p_data->>'note',''), p_actor)
    RETURNING id INTO v_id;
    SELECT to_jsonb(p.*) INTO v_new FROM public.investor_payouts p WHERE p.id = v_id;
    INSERT INTO public.audit_logs (employee_id, action, resource_type, resource_id, new_data)
    VALUES (p_actor, 'create', 'investor_payouts', v_id, v_new);
  ELSE
    SELECT to_jsonb(p.*) INTO v_old FROM public.investor_payouts p WHERE p.id = p_id AND p.deleted_at IS NULL FOR UPDATE;
    IF v_old IS NULL THEN RAISE EXCEPTION 'payout_not_found'; END IF;
    UPDATE public.investor_payouts SET
      investor_id=v_inv, amount_som=v_amt, payout_date=(p_data->>'payout_date')::date,
      period_month=NULLIF(p_data->>'period_month','')::date, payout_type=v_type, note=NULLIF(p_data->>'note','')
    WHERE id=p_id;
    v_id := p_id;
    SELECT to_jsonb(p.*) INTO v_new FROM public.investor_payouts p WHERE p.id = v_id;
    INSERT INTO public.audit_logs (employee_id, action, resource_type, resource_id, old_data, new_data)
    VALUES (p_actor, 'update', 'investor_payouts', v_id, v_old, v_new);
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.save_investor_payout(uuid, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_investor_payout(uuid, jsonb, uuid) TO service_role;

-- ── delete_investor_payout (soft) + аудит ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_investor_payout(p_id uuid, p_actor uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_old jsonb;
BEGIN
  PERFORM public._assert_actor_active(p_actor);
  PERFORM public._assert_finances_manager(p_actor);
  SELECT to_jsonb(p.*) INTO v_old FROM public.investor_payouts p WHERE p.id = p_id AND p.deleted_at IS NULL FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'payout_not_found'; END IF;
  UPDATE public.investor_payouts SET deleted_at = now() WHERE id = p_id;
  INSERT INTO public.audit_logs (employee_id, action, resource_type, resource_id, old_data)
  VALUES (p_actor, 'delete', 'investor_payouts', p_id, v_old);
END;
$$;
REVOKE ALL ON FUNCTION public.delete_investor_payout(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_investor_payout(uuid, uuid) TO service_role;

-- ── save_investor_deal_type / delete_investor_deal_type — только управляющий ────
CREATE OR REPLACE FUNCTION public.save_investor_deal_type(p_id uuid, p_name text, p_actor uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_id uuid; v_old jsonb;
BEGIN
  PERFORM public._assert_actor_active(p_actor);
  PERFORM public._assert_finances_manager(p_actor);
  IF p_name IS NULL OR btrim(p_name) = '' THEN RAISE EXCEPTION 'empty_name'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.investor_deal_types (name, is_system, created_by) VALUES (btrim(p_name), false, p_actor) RETURNING id INTO v_id;
    INSERT INTO public.audit_logs (employee_id, action, resource_type, resource_id, new_data)
    VALUES (p_actor, 'create', 'investor_deal_types', v_id, jsonb_build_object('name', btrim(p_name)));
  ELSE
    SELECT to_jsonb(t.*) INTO v_old FROM public.investor_deal_types t WHERE t.id = p_id AND t.deleted_at IS NULL FOR UPDATE;
    IF v_old IS NULL THEN RAISE EXCEPTION 'deal_type_not_found'; END IF;
    IF (v_old->>'is_system')::boolean THEN RAISE EXCEPTION 'system_deal_type_protected'; END IF;
    UPDATE public.investor_deal_types SET name = btrim(p_name) WHERE id = p_id;
    v_id := p_id;
    INSERT INTO public.audit_logs (employee_id, action, resource_type, resource_id, old_data, new_data)
    VALUES (p_actor, 'update', 'investor_deal_types', v_id, v_old, jsonb_build_object('name', btrim(p_name)));
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.save_investor_deal_type(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_investor_deal_type(uuid, text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.delete_investor_deal_type(p_id uuid, p_actor uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_old jsonb; v_used integer;
BEGIN
  PERFORM public._assert_actor_active(p_actor);
  PERFORM public._assert_finances_manager(p_actor);
  SELECT to_jsonb(t.*) INTO v_old FROM public.investor_deal_types t WHERE t.id = p_id AND t.deleted_at IS NULL FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'deal_type_not_found'; END IF;
  IF (v_old->>'is_system')::boolean THEN RAISE EXCEPTION 'system_deal_type_protected'; END IF;
  SELECT count(*) INTO v_used FROM public.investors WHERE deal_type_id = p_id AND deleted_at IS NULL;
  IF v_used > 0 THEN RAISE EXCEPTION 'deal_type_in_use'; END IF;
  UPDATE public.investor_deal_types SET deleted_at = now() WHERE id = p_id;
  INSERT INTO public.audit_logs (employee_id, action, resource_type, resource_id, old_data)
  VALUES (p_actor, 'delete', 'investor_deal_types', p_id, v_old);
END;
$$;
REVOKE ALL ON FUNCTION public.delete_investor_deal_type(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_investor_deal_type(uuid, uuid) TO service_role;

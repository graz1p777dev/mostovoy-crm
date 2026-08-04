-- ─── 070: Финансы, шаг 3 — долги (обязательства бизнеса) ───────────────────────
--
-- Учёт «кому/сколько/когда должен вернуть». Два типа: поставщику (консигнация — товар в
-- долг) и прочий долг бизнеса. Модель денег (валюта/курс/сомовый эквивалент) — как в
-- expenses/other_income. RLS permissions-driven по finances. Запись — управляющий финансов.
--
-- ВАЖНО (разведение с P&L, чтобы не задвоить):
--   debts = ОБЯЗАТЕЛЬСТВО (баланс/касса): сколько вернуть и когда. Это НЕ операционный
--   расход. Себестоимость проданного товара учитывается ОТДЕЛЬНО в expenses (Шаг 1) в момент
--   продажи. Долг поставщику и себестоимость — разные сущности в разных таблицах; ни один
--   RPC/экшен НЕ добавляет сумму долга в expenses. P&L (прибыль) берёт расходы из expenses;
--   долги идут только в кассовое планирование (ДДС, будущий шаг) через due_date.

CREATE TABLE IF NOT EXISTS public.debts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debt_type       text NOT NULL DEFAULT 'business' CHECK (debt_type IN ('supplier','business')),
  creditor_name   text NOT NULL,
  amount_original numeric NOT NULL CHECK (amount_original > 0),
  currency        text NOT NULL DEFAULT 'KGS' CHECK (currency IN ('KGS','USD')),
  rate            numeric NOT NULL DEFAULT 1 CHECK (rate > 0),
  amount_som      numeric GENERATED ALWAYS AS (amount_original * rate) STORED,
  purchase_date   date NOT NULL,                 -- дата покупки/возникновения долга
  due_date        date NOT NULL,                 -- дата возврата (для кассового планирования)
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paid')),
  paid_date       date,                          -- когда фактически вернули
  note            text,
  created_by      uuid REFERENCES public.employees(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  CONSTRAINT debts_kgs_rate_one CHECK (currency <> 'KGS' OR rate = 1)
);
CREATE INDEX IF NOT EXISTS idx_debts_status   ON public.debts (status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_debts_due      ON public.debts (due_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_debts_type     ON public.debts (debt_type) WHERE deleted_at IS NULL;

REVOKE ALL ON TABLE public.debts FROM anon, authenticated;
GRANT SELECT ON TABLE public.debts TO authenticated;
GRANT ALL    ON TABLE public.debts TO service_role;
ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS debts_select_by_perm ON public.debts;
CREATE POLICY debts_select_by_perm ON public.debts FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND (SELECT public._my_perm_scope('finances')) IS NOT NULL);

-- ── save_debt (insert/update) — управляющий финансов + аудит ───────────────────
CREATE OR REPLACE FUNCTION public.save_debt(p_id uuid, p_data jsonb, p_actor uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_id uuid; v_old jsonb; v_new jsonb; v_type text; v_cur text; v_rate numeric; v_amt numeric;
BEGIN
  PERFORM public._assert_actor_active(p_actor);
  PERFORM public._assert_finances_manager(p_actor);

  v_type := COALESCE(p_data->>'debt_type','business');
  v_cur  := COALESCE(p_data->>'currency','KGS');
  v_rate := COALESCE((p_data->>'rate')::numeric, 1);
  v_amt  := COALESCE((p_data->>'amount_original')::numeric, 0);
  IF v_type NOT IN ('supplier','business') THEN RAISE EXCEPTION 'invalid_debt_type'; END IF;
  IF v_cur NOT IN ('KGS','USD') THEN RAISE EXCEPTION 'invalid_currency'; END IF;
  IF v_cur = 'KGS' THEN v_rate := 1; END IF;
  IF v_rate <= 0 THEN RAISE EXCEPTION 'invalid_rate'; END IF;
  IF v_amt  <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  IF (p_data->>'creditor_name') IS NULL OR btrim(p_data->>'creditor_name') = '' THEN RAISE EXCEPTION 'creditor_required'; END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.debts (debt_type, creditor_name, amount_original, currency, rate, purchase_date, due_date, note, created_by)
    VALUES (v_type, btrim(p_data->>'creditor_name'), v_amt, v_cur, v_rate,
            (p_data->>'purchase_date')::date, (p_data->>'due_date')::date, p_data->>'note', p_actor)
    RETURNING id INTO v_id;
    SELECT to_jsonb(d.*) INTO v_new FROM public.debts d WHERE d.id = v_id;
    INSERT INTO public.audit_logs (employee_id, action, resource_type, resource_id, new_data)
    VALUES (p_actor, 'create', 'debts', v_id, v_new);
  ELSE
    SELECT to_jsonb(d.*) INTO v_old FROM public.debts d WHERE d.id = p_id AND d.deleted_at IS NULL FOR UPDATE;
    IF v_old IS NULL THEN RAISE EXCEPTION 'debt_not_found'; END IF;
    UPDATE public.debts SET
      debt_type=v_type, creditor_name=btrim(p_data->>'creditor_name'), amount_original=v_amt, currency=v_cur, rate=v_rate,
      purchase_date=(p_data->>'purchase_date')::date, due_date=(p_data->>'due_date')::date, note=p_data->>'note'
    WHERE id=p_id;
    v_id := p_id;
    SELECT to_jsonb(d.*) INTO v_new FROM public.debts d WHERE d.id = v_id;
    INSERT INTO public.audit_logs (employee_id, action, resource_type, resource_id, old_data, new_data)
    VALUES (p_actor, 'update', 'debts', v_id, v_old, v_new);
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.save_debt(uuid, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_debt(uuid, jsonb, uuid) TO service_role;

-- ── mark_debt_paid — перевод в 'paid' + дата возврата + аудит ──────────────────
CREATE OR REPLACE FUNCTION public.mark_debt_paid(p_id uuid, p_paid_date date, p_actor uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_old jsonb;
BEGIN
  PERFORM public._assert_actor_active(p_actor);
  PERFORM public._assert_finances_manager(p_actor);
  SELECT to_jsonb(d.*) INTO v_old FROM public.debts d WHERE d.id = p_id AND d.deleted_at IS NULL FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'debt_not_found'; END IF;
  UPDATE public.debts SET status='paid', paid_date=COALESCE(p_paid_date, CURRENT_DATE) WHERE id=p_id;
  INSERT INTO public.audit_logs (employee_id, action, resource_type, resource_id, old_data, new_data)
  VALUES (p_actor, 'update', 'debts', p_id, v_old, jsonb_build_object('event','debt_paid','paid_date',COALESCE(p_paid_date, CURRENT_DATE)));
END;
$$;
REVOKE ALL ON FUNCTION public.mark_debt_paid(uuid, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_debt_paid(uuid, date, uuid) TO service_role;

-- ── delete_debt (soft) + аудит ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_debt(p_id uuid, p_actor uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_old jsonb;
BEGIN
  PERFORM public._assert_actor_active(p_actor);
  PERFORM public._assert_finances_manager(p_actor);
  SELECT to_jsonb(d.*) INTO v_old FROM public.debts d WHERE d.id = p_id AND d.deleted_at IS NULL FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'debt_not_found'; END IF;
  UPDATE public.debts SET deleted_at = now() WHERE id = p_id;
  INSERT INTO public.audit_logs (employee_id, action, resource_type, resource_id, old_data)
  VALUES (p_actor, 'delete', 'debts', p_id, v_old);
END;
$$;
REVOKE ALL ON FUNCTION public.delete_debt(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_debt(uuid, uuid) TO service_role;

-- ─── 069: Финансы, шаг 2 — прочие доходы (ручной ввод) ─────────────────────────
--
-- Основной доход (выручка от продаж) считается из consultations тем же способом, что в
-- декомпозиции (isSold: status_after_fv ∈ ('Купила','Предоплата') + amount) — БД-объектов
-- не требует. Здесь — только РУЧНЫЕ прочие доходы (возвраты, разовое, не от продаж).
-- Модель денег (валюта/курс/сомовый эквивалент) — как в expenses (068). RLS permissions-driven
-- по ресурсу finances. Запись — только управляющий финансов (owner/руководитель), аудит.

CREATE TABLE IF NOT EXISTS public.other_income (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  amount_original numeric NOT NULL CHECK (amount_original > 0),
  currency        text NOT NULL DEFAULT 'KGS' CHECK (currency IN ('KGS','USD')),
  rate            numeric NOT NULL DEFAULT 1 CHECK (rate > 0),
  amount_som      numeric GENERATED ALWAYS AS (amount_original * rate) STORED,
  income_date     date NOT NULL,
  period_month    date NOT NULL,
  created_by      uuid REFERENCES public.employees(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  CONSTRAINT other_income_kgs_rate_one CHECK (currency <> 'KGS' OR rate = 1)
);
CREATE INDEX IF NOT EXISTS idx_other_income_period ON public.other_income (period_month) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_other_income_date   ON public.other_income (income_date) WHERE deleted_at IS NULL;

REVOKE ALL ON TABLE public.other_income FROM anon, authenticated;
GRANT SELECT ON TABLE public.other_income TO authenticated;
GRANT ALL    ON TABLE public.other_income TO service_role;
ALTER TABLE public.other_income ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS other_income_select_by_perm ON public.other_income;
CREATE POLICY other_income_select_by_perm ON public.other_income FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND (SELECT public._my_perm_scope('finances')) IS NOT NULL);

-- ── save_other_income (insert/update) — управляющий финансов + аудит ───────────
CREATE OR REPLACE FUNCTION public.save_other_income(p_id uuid, p_data jsonb, p_actor uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_id uuid; v_old jsonb; v_new jsonb; v_cur text; v_rate numeric; v_amt numeric;
BEGIN
  PERFORM public._assert_actor_active(p_actor);
  PERFORM public._assert_finances_manager(p_actor);

  v_cur  := COALESCE(p_data->>'currency','KGS');
  v_rate := COALESCE((p_data->>'rate')::numeric, 1);
  v_amt  := COALESCE((p_data->>'amount_original')::numeric, 0);
  IF v_cur NOT IN ('KGS','USD') THEN RAISE EXCEPTION 'invalid_currency'; END IF;
  IF v_cur = 'KGS' THEN v_rate := 1; END IF;
  IF v_rate <= 0 THEN RAISE EXCEPTION 'invalid_rate'; END IF;
  IF v_amt  <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.other_income (name, amount_original, currency, rate, income_date, period_month, created_by)
    VALUES (p_data->>'name', v_amt, v_cur, v_rate, (p_data->>'income_date')::date, (p_data->>'period_month')::date, p_actor)
    RETURNING id INTO v_id;
    SELECT to_jsonb(o.*) INTO v_new FROM public.other_income o WHERE o.id = v_id;
    INSERT INTO public.audit_logs (employee_id, action, resource_type, resource_id, new_data)
    VALUES (p_actor, 'create', 'other_income', v_id, v_new);
  ELSE
    SELECT to_jsonb(o.*) INTO v_old FROM public.other_income o WHERE o.id = p_id AND o.deleted_at IS NULL FOR UPDATE;
    IF v_old IS NULL THEN RAISE EXCEPTION 'income_not_found'; END IF;
    UPDATE public.other_income SET
      name=p_data->>'name', amount_original=v_amt, currency=v_cur, rate=v_rate,
      income_date=(p_data->>'income_date')::date, period_month=(p_data->>'period_month')::date
    WHERE id=p_id;
    v_id := p_id;
    SELECT to_jsonb(o.*) INTO v_new FROM public.other_income o WHERE o.id = v_id;
    INSERT INTO public.audit_logs (employee_id, action, resource_type, resource_id, old_data, new_data)
    VALUES (p_actor, 'update', 'other_income', v_id, v_old, v_new);
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.save_other_income(uuid, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_other_income(uuid, jsonb, uuid) TO service_role;

-- ── delete_other_income (soft) — управляющий финансов + аудит ──────────────────
CREATE OR REPLACE FUNCTION public.delete_other_income(p_id uuid, p_actor uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_old jsonb;
BEGIN
  PERFORM public._assert_actor_active(p_actor);
  PERFORM public._assert_finances_manager(p_actor);
  SELECT to_jsonb(o.*) INTO v_old FROM public.other_income o WHERE o.id = p_id AND o.deleted_at IS NULL FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'income_not_found'; END IF;
  UPDATE public.other_income SET deleted_at = now() WHERE id = p_id;
  INSERT INTO public.audit_logs (employee_id, action, resource_type, resource_id, old_data)
  VALUES (p_actor, 'delete', 'other_income', p_id, v_old);
END;
$$;
REVOKE ALL ON FUNCTION public.delete_other_income(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_other_income(uuid, uuid) TO service_role;

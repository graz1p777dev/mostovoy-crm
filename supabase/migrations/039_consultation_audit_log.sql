-- ── Журнал изменений консультаций (аудит) ────────────────────────────────────
--
-- Таблица consultation_audit_log + атомарные RPC для create/update/delete консультации
-- (аналогично rebook_consultation из 037). Запись в аудит происходит ВНУТРИ той же
-- транзакции, что и сама мутация — гарантия «без потери записей» (не полагаемся на то,
-- что серверный код не забудет отдельно вызвать логирование).
--
-- rebook_consultation (037) пересоздаётся с доп. параметром p_actor_employee_id —
-- пишет 2 строки аудита (action='rebook') за одну транзакцию: на старую и на новую запись.

CREATE TABLE IF NOT EXISTS public.consultation_audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id uuid NOT NULL REFERENCES public.consultations(id),
  changed_by      uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  action          text NOT NULL CHECK (action IN ('create','update','delete','rebook')),
  changes         jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {"field": {"old": ..., "new": ...}, ...}
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consultation_audit_log_consultation
  ON public.consultation_audit_log(consultation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_consultation_audit_log_created_at
  ON public.consultation_audit_log(created_at DESC);

ALTER TABLE public.consultation_audit_log ENABLE ROW LEVEL SECURITY;
-- Чтение — только через Server Actions (service_role/admin-клиент), которые сами
-- проверяют право на просмотр аудита (owner/rop). anon/authenticated прямого доступа не имеют.
DROP POLICY IF EXISTS consultation_audit_log_no_direct_access ON public.consultation_audit_log;
CREATE POLICY consultation_audit_log_no_direct_access ON public.consultation_audit_log
  FOR ALL TO authenticated, anon USING (false);

-- ── Хелпер: jsonb-диф изменённых полей (только те, что реально отличаются) ───────
CREATE OR REPLACE FUNCTION public._consultation_diff(p_old jsonb, p_new jsonb)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE(jsonb_object_agg(key, jsonb_build_object('old', old_val, 'new', new_val)), '{}'::jsonb)
  FROM (
    SELECT key,
           p_old -> key AS old_val,
           p_new -> key AS new_val
    FROM jsonb_object_keys(p_new) AS key
    WHERE p_old -> key IS DISTINCT FROM p_new -> key
  ) diff;
$$;

REVOKE ALL ON FUNCTION public._consultation_diff(jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._consultation_diff(jsonb, jsonb) TO service_role;

-- ── create_consultation ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_consultation(
  p_data              jsonb,
  p_actor_employee_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_id uuid;
  v_row jsonb;
BEGIN
  INSERT INTO public.consultations (
    date, time, client_name, phone, deal_number, format, manager_id,
    status, alb_status, actual_status, status_after_fv,
    amount, delivery_cost, is_nv, comment, consulting_doctor
  ) VALUES (
    (p_data->>'date')::date,
    (p_data->>'time')::time,
    p_data->>'client_name',
    p_data->>'phone',
    p_data->>'deal_number',
    p_data->>'format',
    NULLIF(p_data->>'manager_id','')::uuid,
    p_data->>'status',
    p_data->>'alb_status',
    p_data->>'actual_status',
    p_data->>'status_after_fv',
    COALESCE((p_data->>'amount')::numeric, 0),
    COALESCE((p_data->>'delivery_cost')::numeric, 0),
    COALESCE((p_data->>'is_nv')::boolean, true),
    p_data->>'comment',
    p_data->>'consulting_doctor'
  ) RETURNING id INTO v_id;

  SELECT to_jsonb(c.*) INTO v_row FROM public.consultations c WHERE c.id = v_id;

  INSERT INTO public.consultation_audit_log (consultation_id, changed_by, action, changes)
  VALUES (v_id, p_actor_employee_id, 'create', jsonb_build_object('created', v_row));

  RETURN v_id;
END;
$$;

-- ── update_consultation ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_consultation(
  p_id                uuid,
  p_data              jsonb,
  p_actor_employee_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_old public.consultations%ROWTYPE;
  v_old_json jsonb;
  v_new_json jsonb;
BEGIN
  SELECT * INTO v_old FROM public.consultations WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'consultation_not_found';
  END IF;
  IF v_old.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'consultation_deleted';
  END IF;
  v_old_json := to_jsonb(v_old);

  UPDATE public.consultations SET
    date              = (p_data->>'date')::date,
    time              = (p_data->>'time')::time,
    client_name       = p_data->>'client_name',
    phone             = p_data->>'phone',
    deal_number       = p_data->>'deal_number',
    format            = p_data->>'format',
    manager_id        = NULLIF(p_data->>'manager_id','')::uuid,
    status            = p_data->>'status',
    alb_status        = p_data->>'alb_status',
    actual_status     = p_data->>'actual_status',
    status_after_fv   = p_data->>'status_after_fv',
    amount            = COALESCE((p_data->>'amount')::numeric, 0),
    delivery_cost     = COALESCE((p_data->>'delivery_cost')::numeric, 0),
    is_nv             = COALESCE((p_data->>'is_nv')::boolean, true),
    comment           = p_data->>'comment',
    consulting_doctor = p_data->>'consulting_doctor',
    updated_at        = now()
  WHERE id = p_id;

  SELECT to_jsonb(c.*) INTO v_new_json FROM public.consultations c WHERE c.id = p_id;

  INSERT INTO public.consultation_audit_log (consultation_id, changed_by, action, changes)
  VALUES (p_id, p_actor_employee_id, 'update', public._consultation_diff(v_old_json, v_new_json));
END;
$$;

-- ── delete_consultation (soft delete) ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_consultation(
  p_id                uuid,
  p_actor_employee_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_old public.consultations%ROWTYPE;
BEGIN
  SELECT * INTO v_old FROM public.consultations WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'consultation_not_found';
  END IF;
  IF v_old.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'already_deleted';
  END IF;

  UPDATE public.consultations SET deleted_at = now() WHERE id = p_id;

  INSERT INTO public.consultation_audit_log (consultation_id, changed_by, action, changes)
  VALUES (p_id, p_actor_employee_id, 'delete', jsonb_build_object('deleted_at', now()));
END;
$$;

REVOKE ALL ON FUNCTION public.create_consultation(jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_consultation(jsonb, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.update_consultation(uuid, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_consultation(uuid, jsonb, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.delete_consultation(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_consultation(uuid, uuid) TO service_role;

-- ── rebook_consultation: пересоздаём с actor + запись аудита (action='rebook') ──
DROP FUNCTION IF EXISTS public.rebook_consultation(uuid, date, time, jsonb);

CREATE OR REPLACE FUNCTION public.rebook_consultation(
  p_old_id            uuid,
  p_new_date          date,
  p_new_time          time,
  p_data              jsonb,
  p_actor_employee_id uuid
)
RETURNS TABLE(old_id uuid, new_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_old      public.consultations%ROWTYPE;
  v_old_json jsonb;
  v_new_id   uuid;
  v_new_json jsonb;
  v_old_after jsonb;
BEGIN
  SELECT * INTO v_old FROM public.consultations WHERE id = p_old_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'consultation_not_found';
  END IF;
  IF v_old.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'consultation_deleted';
  END IF;
  IF v_old.rescheduled_to_id IS NOT NULL THEN
    RAISE EXCEPTION 'already_rescheduled';
  END IF;
  v_old_json := to_jsonb(v_old);

  INSERT INTO public.consultations (
    date, time, client_name, phone, deal_number, format, manager_id,
    status, alb_status, actual_status, status_after_fv,
    amount, delivery_cost, is_nv, comment, consulting_doctor,
    rescheduled_from_id
  ) VALUES (
    p_new_date, p_new_time,
    p_data->>'client_name',
    p_data->>'phone',
    p_data->>'deal_number',
    p_data->>'format',
    NULLIF(p_data->>'manager_id','')::uuid,
    'Перезаписанный', NULL, NULL, NULL,
    0, 0, true, NULL, NULL,
    p_old_id
  ) RETURNING id INTO v_new_id;

  UPDATE public.consultations SET
    status            = 'Перезапись',
    client_name       = p_data->>'client_name',
    phone             = p_data->>'phone',
    deal_number       = p_data->>'deal_number',
    format            = p_data->>'format',
    manager_id        = NULLIF(p_data->>'manager_id','')::uuid,
    alb_status        = p_data->>'alb_status',
    actual_status     = p_data->>'actual_status',
    status_after_fv   = p_data->>'status_after_fv',
    amount            = COALESCE((p_data->>'amount')::numeric, 0),
    delivery_cost     = COALESCE((p_data->>'delivery_cost')::numeric, 0),
    is_nv             = COALESCE((p_data->>'is_nv')::boolean, true),
    comment           = p_data->>'comment',
    consulting_doctor = p_data->>'consulting_doctor',
    rescheduled_to_id = v_new_id,
    updated_at        = now()
  WHERE id = p_old_id;

  SELECT to_jsonb(c.*) INTO v_old_after FROM public.consultations c WHERE c.id = p_old_id;
  SELECT to_jsonb(c.*) INTO v_new_json FROM public.consultations c WHERE c.id = v_new_id;

  INSERT INTO public.consultation_audit_log (consultation_id, changed_by, action, changes)
  VALUES
    (p_old_id, p_actor_employee_id, 'rebook', public._consultation_diff(v_old_json, v_old_after)),
    (v_new_id, p_actor_employee_id, 'rebook', jsonb_build_object('created_from', p_old_id, 'created', v_new_json));

  RETURN QUERY SELECT p_old_id, v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rebook_consultation(uuid, date, time, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rebook_consultation(uuid, date, time, jsonb, uuid) TO service_role;

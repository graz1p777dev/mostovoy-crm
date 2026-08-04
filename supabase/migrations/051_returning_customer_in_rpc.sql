-- ─── 051: проброс is_returning_customer в RPC консультаций (Блокер Codex #2) ───
--
-- Колонка consultations.is_returning_customer заведена в 048, UI и zod-схема поле
-- передают, НО транзакционные RPC create/update/rebook его игнорировали — INSERT/UPDATE
-- не содержали колонки, поэтому она всегда оставалась DEFAULT false. Галочка
-- «постоянный клиент» не сохранялась, статистика постоянных клиентов не работала.
--
-- Здесь три RPC пересоздаются с проброс поля. Вся остальная логика сохранена БЕЗ
-- изменений (атомарность, аудит, проверки scope из 041, SELECT ... FOR UPDATE,
-- SECURITY DEFINER + search_path, GRANT только service_role). Единственная правка —
-- добавление is_returning_customer в списки колонок.
--
-- Сигнатуры не меняются, поэтому CREATE OR REPLACE (без DROP): актуальные версии —
-- create_consultation(jsonb,uuid) из 039; update/rebook со scope-параметрами из 041.

-- ── create_consultation — добавлен is_returning_customer в INSERT ─────────────
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
    amount, delivery_cost, is_nv, is_returning_customer, comment, consulting_doctor
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
    COALESCE((p_data->>'is_returning_customer')::boolean, false),
    p_data->>'comment',
    p_data->>'consulting_doctor'
  ) RETURNING id INTO v_id;

  SELECT to_jsonb(c.*) INTO v_row FROM public.consultations c WHERE c.id = v_id;

  INSERT INTO public.consultation_audit_log (consultation_id, changed_by, action, changes)
  VALUES (v_id, p_actor_employee_id, 'create', jsonb_build_object('created', v_row));

  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_consultation(jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_consultation(jsonb, uuid) TO service_role;

-- ── update_consultation (сигнатура из 041) — добавлен is_returning_customer ────
CREATE OR REPLACE FUNCTION public.update_consultation(
  p_id                uuid,
  p_data              jsonb,
  p_actor_employee_id uuid,
  p_actor_scope       text,
  p_actor_department_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_old      public.consultations%ROWTYPE;
  v_old_json jsonb;
  v_new_json jsonb;
BEGIN
  SELECT * INTO v_old FROM public.consultations WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'consultation_not_found'; END IF;
  IF v_old.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'consultation_deleted'; END IF;

  -- (а) владение существующей строкой; (б) новый manager в охвате
  IF NOT public._manager_in_scope(v_old.manager_id, p_actor_employee_id, p_actor_scope, p_actor_department_id) THEN
    RAISE EXCEPTION 'scope_violation';
  END IF;
  IF NOT public._manager_in_scope(NULLIF(p_data->>'manager_id','')::uuid, p_actor_employee_id, p_actor_scope, p_actor_department_id) THEN
    RAISE EXCEPTION 'scope_violation';
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
    is_returning_customer = COALESCE((p_data->>'is_returning_customer')::boolean, false),
    comment           = p_data->>'comment',
    consulting_doctor = p_data->>'consulting_doctor',
    updated_at        = now()
  WHERE id = p_id;

  SELECT to_jsonb(c.*) INTO v_new_json FROM public.consultations c WHERE c.id = p_id;

  INSERT INTO public.consultation_audit_log (consultation_id, changed_by, action, changes)
  VALUES (p_id, p_actor_employee_id, 'update', public._consultation_diff(v_old_json, v_new_json));
END;
$$;
REVOKE ALL ON FUNCTION public.update_consultation(uuid, jsonb, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_consultation(uuid, jsonb, uuid, text, uuid) TO service_role;

-- ── rebook_consultation (сигнатура из 041) — добавлен is_returning_customer ────
-- Метка «постоянный клиент» — свойство клиента, поэтому переносится и на новую
-- запись (плейсхолдер «Перезаписанный»), и на старую при её обновлении из p_data.
CREATE OR REPLACE FUNCTION public.rebook_consultation(
  p_old_id            uuid,
  p_new_date          date,
  p_new_time          time,
  p_data              jsonb,
  p_actor_employee_id uuid,
  p_actor_scope       text,
  p_actor_department_id uuid
)
RETURNS TABLE(old_id uuid, new_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_old       public.consultations%ROWTYPE;
  v_old_json  jsonb;
  v_new_id    uuid;
  v_new_json  jsonb;
  v_old_after jsonb;
BEGIN
  SELECT * INTO v_old FROM public.consultations WHERE id = p_old_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'consultation_not_found'; END IF;
  IF v_old.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'consultation_deleted'; END IF;
  IF v_old.rescheduled_to_id IS NOT NULL THEN RAISE EXCEPTION 'already_rescheduled'; END IF;

  IF NOT public._manager_in_scope(v_old.manager_id, p_actor_employee_id, p_actor_scope, p_actor_department_id) THEN
    RAISE EXCEPTION 'scope_violation';
  END IF;
  IF NOT public._manager_in_scope(NULLIF(p_data->>'manager_id','')::uuid, p_actor_employee_id, p_actor_scope, p_actor_department_id) THEN
    RAISE EXCEPTION 'scope_violation';
  END IF;

  v_old_json := to_jsonb(v_old);

  INSERT INTO public.consultations (
    date, time, client_name, phone, deal_number, format, manager_id,
    status, alb_status, actual_status, status_after_fv,
    amount, delivery_cost, is_nv, is_returning_customer, comment, consulting_doctor,
    rescheduled_from_id
  ) VALUES (
    p_new_date, p_new_time,
    p_data->>'client_name', p_data->>'phone', p_data->>'deal_number', p_data->>'format',
    NULLIF(p_data->>'manager_id','')::uuid,
    'Перезаписанный', NULL, NULL, NULL,
    0, 0, true, COALESCE((p_data->>'is_returning_customer')::boolean, false), NULL, NULL,
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
    is_returning_customer = COALESCE((p_data->>'is_returning_customer')::boolean, false),
    comment           = p_data->>'comment',
    consulting_doctor = p_data->>'consulting_doctor',
    rescheduled_to_id = v_new_id,
    updated_at        = now()
  WHERE id = p_old_id;

  SELECT to_jsonb(c.*) INTO v_old_after FROM public.consultations c WHERE c.id = p_old_id;
  SELECT to_jsonb(c.*) INTO v_new_json  FROM public.consultations c WHERE c.id = v_new_id;

  INSERT INTO public.consultation_audit_log (consultation_id, changed_by, action, changes)
  VALUES
    (p_old_id, p_actor_employee_id, 'rebook', public._consultation_diff(v_old_json, v_old_after)),
    (v_new_id, p_actor_employee_id, 'rebook', jsonb_build_object('created_from', p_old_id, 'created', v_new_json));

  RETURN QUERY SELECT p_old_id, v_new_id;
END;
$$;
REVOKE ALL ON FUNCTION public.rebook_consultation(uuid, date, time, jsonb, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rebook_consultation(uuid, date, time, jsonb, uuid, text, uuid) TO service_role;

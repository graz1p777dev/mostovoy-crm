-- ── P0: проверка scope ВНУТРИ RPC (после FOR UPDATE) + lockdown close_kpi_month ─
--
-- Блокер Codex #1: смена manager_id при update/rebook обходила scope — пользователь
-- со scope own/team мог переназначить запись сотруднику вне своего охвата. Node-проверка
-- до RPC оставляла TOCTOU-щель между pre-check и локом строки.
-- Решение: перепроверка scope ВНУТРИ транзакции RPC, после SELECT ... FOR UPDATE —
--   (а) старая запись должна принадлежать охвату актора (manager текущей строки);
--   (б) НОВЫЙ manager_id из p_data тоже должен быть в охвате (нельзя отдать вне scope).
-- Для scope='all' (owner, mp, lmai) проверки всегда проходят.
--
-- Блокер Codex #4: close_kpi_month имел прямой EXECUTE у authenticated (legacy). Приводим
-- к общему паттерну: SECDEF + search_path, EXECUTE только service_role, вызывается из
-- Server Action через admin-клиент. Внутренняя get_my_role()-проверка убрана (не работает
-- под service_role) — авторизация теперь на уровне Node (getActor + can + owner/accountant),
-- id закрывающего передаётся параметром p_closer_id.

-- ── helper: принадлежит ли manager_id охвату актора ───────────────────────────
CREATE OR REPLACE FUNCTION public._manager_in_scope(
  p_manager_id  uuid,
  p_actor_emp   uuid,
  p_scope       text,
  p_actor_dept  uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_dept uuid;
BEGIN
  IF p_scope = 'all' THEN RETURN true; END IF;
  IF p_manager_id IS NULL THEN RETURN false; END IF;  -- own/team требуют явной принадлежности
  IF p_scope = 'own' THEN RETURN p_manager_id = p_actor_emp; END IF;
  IF p_scope = 'team' THEN
    IF p_manager_id = p_actor_emp THEN RETURN true; END IF;
    SELECT department_id INTO v_dept FROM public.employees WHERE id = p_manager_id;
    RETURN v_dept IS NOT NULL AND v_dept = p_actor_dept;
  END IF;
  RETURN false;  -- неизвестный scope → fail-closed
END;
$$;
REVOKE ALL ON FUNCTION public._manager_in_scope(uuid, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._manager_in_scope(uuid, uuid, text, uuid) TO service_role;

-- ── update_consultation с проверкой scope (пересоздаём поверх 039) ────────────
DROP FUNCTION IF EXISTS public.update_consultation(uuid, jsonb, uuid);
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

-- ── rebook_consultation с проверкой scope (пересоздаём поверх 039) ────────────
DROP FUNCTION IF EXISTS public.rebook_consultation(uuid, date, time, jsonb, uuid);
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
    amount, delivery_cost, is_nv, comment, consulting_doctor,
    rescheduled_from_id
  ) VALUES (
    p_new_date, p_new_time,
    p_data->>'client_name', p_data->>'phone', p_data->>'deal_number', p_data->>'format',
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

-- ── #4: close_kpi_month — lockdown до service_role, авторизация в Node ─────────
DROP FUNCTION IF EXISTS public.close_kpi_month(uuid, smallint, smallint);
CREATE OR REPLACE FUNCTION public.close_kpi_month(
  p_employee_id uuid,
  p_year        smallint,
  p_month       smallint,
  p_closer_id   uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  -- Авторизация вызывающего (owner/accountant) выполнена в Server Action до вызова
  -- через admin-клиент. Внутренняя get_my_role()-проверка убрана (не работает под
  -- service_role). p_closer_id — сотрудник, зафиксированный как closed_by.
  PERFORM public.recalculate_kpi_results(p_employee_id, p_year, p_month);

  INSERT INTO public.employee_kpi_results (
    employee_id, period_year, period_month,
    plan_completion_pct, plan_bonus, items_bonus, daily_bonus, total_bonus,
    is_closed, closed_at, closed_by
  )
  VALUES (
    p_employee_id, p_year, p_month,
    0, 0, 0, 0, 0,
    true, NOW(), p_closer_id
  )
  ON CONFLICT (employee_id, period_year, period_month)
  DO UPDATE SET
    is_closed  = true,
    closed_at  = NOW(),
    closed_by  = p_closer_id,
    updated_at = NOW();
END;
$$;
REVOKE ALL ON FUNCTION public.close_kpi_month(uuid, smallint, smallint, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_kpi_month(uuid, smallint, smallint, uuid) TO service_role;

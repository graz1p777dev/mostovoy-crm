-- ─── 082: область прав по актору, а не по JWT ─────────────────────────────────
--
-- ПОЧЕМУ (найдено сквозным тестом до выката). correct_attendance и
-- get_attendance_counters определяли область через public._my_perm_scope(), который
-- читает JWT текущей сессии. Но server actions ходят в БД под admin-клиентом
-- (service_role) — JWT там нет, _my_perm_scope() возвращает NULL, и обе функции
-- всегда отвечали 'forbidden'. То есть правка владельца не сработала бы вообще
-- никогда, а счётчики всегда были бы пустыми.
--
-- РЕШЕНИЕ: область берём из роли переданного актора напрямую по таблице permissions.
-- Актор в эти функции и так передаётся параметром и проверяется _assert_actor_active,
-- а вызывать их может только сервер (гранты отозваны в 078).

CREATE OR REPLACE FUNCTION public._perm_scope_for(p_actor uuid, p_resource text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.scope
  FROM public.employees e
  JOIN public.roles r       ON r.name = e.role AND r.deleted_at IS NULL
  JOIN public.permissions p ON p.role_id = r.id AND p.resource = p_resource
  WHERE e.id = p_actor AND e.deleted_at IS NULL
  LIMIT 1;
$$;

COMMENT ON FUNCTION public._perm_scope_for(uuid, text) IS
  'Область прав роли актора без опоры на JWT. Нужна там, где вызов идёт под '
  'service_role (server actions), где _my_perm_scope() возвращает NULL.';

-- ── Счётчики: область по актору ───────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_attendance_counters(uuid, date);

CREATE OR REPLACE FUNCTION public.get_attendance_counters(
  p_actor       uuid,
  p_employee_id uuid,
  p_as_of       date DEFAULT NULL
)
RETURNS TABLE (
  soft_month integer, soft_rolling3 integer, hard_month integer,
  month_key text, rolling3_key text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_scope text;
  v_actor_dept uuid;
  v_as_of date := COALESCE(p_as_of, public._company_today());
  v_m_start date := date_trunc('month', v_as_of)::date;
  v_m_end   date := (date_trunc('month', v_as_of) + interval '1 month - 1 day')::date;
  v_r_start date := (date_trunc('month', v_as_of) - interval '2 months')::date;
BEGIN
  -- fail-closed: счётчики видны только управляющим посещаемостью.
  v_scope := public._perm_scope_for(p_actor, 'attendance');
  IF v_scope IS NULL OR v_scope NOT IN ('team','all') THEN
    RETURN;
  END IF;

  IF v_scope = 'team' THEN
    SELECT department_id INTO v_actor_dept FROM public.employees WHERE id = p_actor;
    IF NOT EXISTS (SELECT 1 FROM public.employees
                    WHERE id = p_employee_id AND department_id = v_actor_dept) THEN
      RETURN;
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    (SELECT count(*)::integer FROM public.attendance a
      WHERE a.employee_id = p_employee_id AND a.date BETWEEN v_m_start AND v_m_end
        AND a.late_grade = 'late_soft'),
    (SELECT count(*)::integer FROM public.attendance a
      WHERE a.employee_id = p_employee_id AND a.date BETWEEN v_r_start AND v_m_end
        AND a.late_grade = 'late_soft'),
    (SELECT count(*)::integer FROM public.attendance a
      WHERE a.employee_id = p_employee_id AND a.date BETWEEN v_m_start AND v_m_end
        AND a.late_grade IN ('late_hard','late_critical')),
    to_char(v_as_of, 'YYYY-MM'),
    to_char(v_r_start, 'YYYY-MM') || '..' || to_char(v_as_of, 'YYYY-MM');
END;
$$;

-- ── Правка: область по актору ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.correct_attendance(
  p_actor uuid, p_attendance_id uuid, p_changes jsonb, p_comment text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_scope text; v_old record; v_actor_dept uuid;
  v_status text; v_late int; v_grade text; v_counts boolean;
  v_checkin timestamptz; v_checkout timestamptz;
  v_over int; v_short int; v_worked int;
  v_out_min int; v_end_min int;
BEGIN
  PERFORM public._assert_actor_active(p_actor);

  IF p_comment IS NULL OR length(trim(p_comment)) = 0 THEN
    RETURN jsonb_build_object('status','error','reason','comment_required');
  END IF;

  v_scope := public._perm_scope_for(p_actor, 'attendance');
  IF v_scope IS NULL OR v_scope NOT IN ('team','all') THEN
    RETURN jsonb_build_object('status','error','reason','forbidden');
  END IF;

  SELECT * INTO v_old FROM public.attendance WHERE id = p_attendance_id;
  IF v_old.id IS NULL THEN
    RETURN jsonb_build_object('status','error','reason','not_found');
  END IF;

  IF v_scope = 'team' THEN
    SELECT department_id INTO v_actor_dept FROM public.employees WHERE id = p_actor;
    IF NOT EXISTS (SELECT 1 FROM public.employees
                    WHERE id = v_old.employee_id AND department_id = v_actor_dept) THEN
      RETURN jsonb_build_object('status','error','reason','out_of_scope');
    END IF;
  END IF;

  v_status   := COALESCE(p_changes->>'status', v_old.status);
  v_checkin  := COALESCE((p_changes->>'check_in_time')::timestamptz, v_old.check_in_time);
  v_checkout := COALESCE((p_changes->>'check_out_time')::timestamptz, v_old.check_out_time);

  -- Опоздание пересчитывается от СНИМКА смены, а не от текущего графика сотрудника.
  IF v_checkin IS NOT NULL THEN
    v_late := GREATEST(0,
      (extract(hour from (v_checkin AT TIME ZONE 'Asia/Bishkek'))::int * 60
       + extract(minute from (v_checkin AT TIME ZONE 'Asia/Bishkek'))::int)
      - (extract(hour from v_old.planned_start)::int * 60
         + extract(minute from v_old.planned_start)::int));
  ELSE
    v_late := 0;
  END IF;
  v_grade := public._late_grade(v_late);

  v_counts := CASE
    WHEN v_status IN ('worked','remote') AND v_grade <> 'late_critical' THEN true
    ELSE false
  END;
  IF p_changes ? 'counts_as_worked' THEN
    v_counts := (p_changes->>'counts_as_worked')::boolean;
  END IF;

  v_over := 0; v_short := 0; v_worked := v_old.worked_minutes;
  IF v_checkin IS NOT NULL AND v_checkout IS NOT NULL THEN
    v_worked := GREATEST(0, (extract(epoch from (v_checkout - v_checkin)) / 60)::int);
    v_out_min := extract(hour from (v_checkout AT TIME ZONE 'Asia/Bishkek'))::int * 60
               + extract(minute from (v_checkout AT TIME ZONE 'Asia/Bishkek'))::int;
    v_end_min := extract(hour from v_old.planned_end)::int * 60
               + extract(minute from v_old.planned_end)::int;
    IF v_out_min > v_end_min THEN v_over := v_out_min - v_end_min;
    ELSIF v_out_min < v_end_min THEN v_short := v_end_min - v_out_min;
    END IF;
  END IF;

  UPDATE public.attendance
     SET status = v_status,
         check_in_time = v_checkin,
         check_out_time = v_checkout,
         late_minutes = v_late,
         late_grade = v_grade,
         counts_as_worked = v_counts,
         worked_minutes = v_worked,
         overtime_minutes = v_over,
         shortfall_minutes = v_short,
         comment = COALESCE(p_changes->>'comment', comment),
         marked_by = p_actor,
         check_in_source = CASE WHEN v_checkin IS DISTINCT FROM v_old.check_in_time
                                THEN 'manual_owner' ELSE check_in_source END,
         updated_at = now()
   WHERE id = p_attendance_id;

  INSERT INTO public.attendance_corrections (attendance_id, corrected_by, comment, old_values, new_values)
  VALUES (
    p_attendance_id, p_actor, trim(p_comment),
    jsonb_build_object('status',v_old.status,'check_in_time',v_old.check_in_time,
                       'check_out_time',v_old.check_out_time,'late_minutes',v_old.late_minutes,
                       'late_grade',v_old.late_grade,'counts_as_worked',v_old.counts_as_worked,
                       'overtime_minutes',v_old.overtime_minutes,'shortfall_minutes',v_old.shortfall_minutes),
    jsonb_build_object('status',v_status,'check_in_time',v_checkin,
                       'check_out_time',v_checkout,'late_minutes',v_late,
                       'late_grade',v_grade,'counts_as_worked',v_counts,
                       'overtime_minutes',v_over,'shortfall_minutes',v_short)
  );

  PERFORM public.recompute_attendance_alerts(v_old.employee_id);

  RETURN jsonb_build_object('status','ok');
END;
$$;

REVOKE ALL ON FUNCTION public.get_attendance_counters(uuid,uuid,date) FROM public;
REVOKE ALL ON FUNCTION public.correct_attendance(uuid,uuid,jsonb,text) FROM public;

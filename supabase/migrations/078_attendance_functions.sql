-- ─── 078: посещаемость, фаза 1 — серверные функции ────────────────────────────
--
-- После 077 запись в attendance доступна только отсюда: все политики записи сняты,
-- гранты у authenticated отозваны. Каждая функция SECURITY DEFINER и проверяет права
-- внутри (fail-closed).
--
-- ВРЕМЯ. Всё считается в Asia/Bishkek. Прежняя реализация держала смещение константой
-- COMPANY_OFFSET_MIN=6*60 в TypeScript, а клиентский «замок» от повторов считал дату
-- по UTC — из-за расхождения приход с 00:00 до 06:00 не срабатывал вовсе (аудит 7.7).
-- Здесь единственный источник времени — сервер БД.
--
-- ГРАНИЦЫ ОПОЗДАНИЙ (согласованы с владельцем, невзаимопересекающиеся):
--   0            → on_time
--   1..5  вкл.   → late_forgiven  — фиксируем, не предупреждаем, не считаем
--   >5..15 вкл.  → late_soft      — предупреждение + мягкий счётчик
--   >15..30 вкл. → late_hard      — предупреждение + жёсткий счётчик
--   >30          → late_critical  — жёсткий счётчик И день НЕ зачитывается

SET check_function_bodies = off;

-- ── Вспомогательное: «сейчас» по времени компании ─────────────────────────────
CREATE OR REPLACE FUNCTION public._company_now()
RETURNS timestamptz LANGUAGE sql STABLE AS $$
  SELECT now();
$$;

CREATE OR REPLACE FUNCTION public._company_today()
RETURNS date LANGUAGE sql STABLE AS $$
  SELECT (now() AT TIME ZONE 'Asia/Bishkek')::date;
$$;

COMMENT ON FUNCTION public._company_today() IS
  'Рабочая дата по Asia/Bishkek. Единственный источник «сегодня» для посещаемости.';

-- ── Оценка опоздания ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._late_grade(p_late_minutes integer)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_late_minutes IS NULL OR p_late_minutes <= 0 THEN 'on_time'
    WHEN p_late_minutes <= 5  THEN 'late_forgiven'
    WHEN p_late_minutes <= 15 THEN 'late_soft'
    WHEN p_late_minutes <= 30 THEN 'late_hard'
    ELSE 'late_critical'
  END;
$$;

-- ── Кто отвечает за посещаемость данного сотрудника ───────────────────────────
-- Получатель сигналов НЕ зашит как owner. Берём тех, у кого право attendance.can_edit
-- и область team/all: сейчас это владелец, а когда наймут руководителя отдела и дадут
-- ему право — он начнёт получать сигналы сам, без правки кода (требование владельца).
CREATE OR REPLACE FUNCTION public._attendance_supervisors(p_employee_id uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT sup.id
  FROM public.employees sup
  JOIN public.roles r        ON r.name = sup.role AND r.deleted_at IS NULL
  JOIN public.permissions p  ON p.role_id = r.id AND p.resource = 'attendance'
  LEFT JOIN public.employees target ON target.id = p_employee_id
  WHERE sup.deleted_at IS NULL
    AND sup.status = 'active'
    AND p.can_edit = true
    AND (
      p.scope = 'all'
      OR (p.scope = 'team' AND sup.department_id IS NOT NULL
          AND sup.department_id = target.department_id)
    );
$$;

-- ── Счётчики опозданий — считаются на лету, нигде не хранятся ─────────────────
-- Видны ТОЛЬКО тем, кто управляет посещаемостью. Сотрудник свои счётчики не видит
-- никогда — прямое требование владельца (человек, знающий, что его увольняют, может
-- испортить последний рабочий день).
CREATE OR REPLACE FUNCTION public.get_attendance_counters(
  p_employee_id uuid,
  p_as_of       date DEFAULT NULL
)
RETURNS TABLE (
  soft_month     integer,
  soft_rolling3  integer,
  hard_month     integer,
  month_key      text,
  rolling3_key   text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_scope text;
  v_as_of date := COALESCE(p_as_of, public._company_today());
  v_m_start date := date_trunc('month', v_as_of)::date;
  v_m_end   date := (date_trunc('month', v_as_of) + interval '1 month - 1 day')::date;
  v_r_start date := (date_trunc('month', v_as_of) - interval '2 months')::date;
BEGIN
  -- fail-closed: без права управления посещаемостью счётчики не отдаём вовсе
  v_scope := public._my_perm_scope('attendance');
  IF v_scope IS NULL OR v_scope NOT IN ('team','all') THEN
    RETURN;
  END IF;

  IF v_scope = 'team'
     AND p_employee_id NOT IN (SELECT public._my_dept_employee_ids()) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    (SELECT count(*)::integer FROM public.attendance a
      WHERE a.employee_id = p_employee_id AND a.date BETWEEN v_m_start AND v_m_end
        AND a.late_grade = 'late_soft'),
    (SELECT count(*)::integer FROM public.attendance a
      WHERE a.employee_id = p_employee_id AND a.date BETWEEN v_r_start AND v_m_end
        AND a.late_grade = 'late_soft'),
    -- жёсткий счётчик = ВСЁ, что больше 15 минут, включая >30 (подтверждено владельцем)
    (SELECT count(*)::integer FROM public.attendance a
      WHERE a.employee_id = p_employee_id AND a.date BETWEEN v_m_start AND v_m_end
        AND a.late_grade IN ('late_hard','late_critical')),
    to_char(v_as_of, 'YYYY-MM'),
    to_char(v_r_start, 'YYYY-MM') || '..' || to_char(v_as_of, 'YYYY-MM');
END;
$$;

-- ── Пересчёт сигналов ─────────────────────────────────────────────────────────
-- Идемпотентно: UNIQUE(employee_id, alert_type, period_key) + ON CONFLICT DO NOTHING.
-- Пороги: мягкий 5/месяц и 9/3 месяца (второй ловит игру на сбросе месяца), жёсткий 3/месяц.
CREATE OR REPLACE FUNCTION public.recompute_attendance_alerts(p_employee_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_as_of date := public._company_today();
  v_m_start date := date_trunc('month', v_as_of)::date;
  v_m_end   date := (date_trunc('month', v_as_of) + interval '1 month - 1 day')::date;
  v_r_start date := (date_trunc('month', v_as_of) - interval '2 months')::date;
  v_soft_m int; v_soft_r int; v_hard_m int;
  v_month_key text := to_char(v_as_of, 'YYYY-MM');
  v_r_key text := to_char(v_r_start, 'YYYY-MM') || '..' || to_char(v_as_of, 'YYYY-MM');
  v_created int := 0;
  v_emp_name text;
  v_sup uuid;
BEGIN
  SELECT count(*) INTO v_soft_m FROM public.attendance
   WHERE employee_id = p_employee_id AND date BETWEEN v_m_start AND v_m_end
     AND late_grade = 'late_soft';
  SELECT count(*) INTO v_soft_r FROM public.attendance
   WHERE employee_id = p_employee_id AND date BETWEEN v_r_start AND v_m_end
     AND late_grade = 'late_soft';
  SELECT count(*) INTO v_hard_m FROM public.attendance
   WHERE employee_id = p_employee_id AND date BETWEEN v_m_start AND v_m_end
     AND late_grade IN ('late_hard','late_critical');

  SELECT name INTO v_emp_name FROM public.employees WHERE id = p_employee_id;

  IF v_soft_m >= 5 THEN
    INSERT INTO public.attendance_alerts (employee_id, alert_type, period_key, threshold, actual_value)
    VALUES (p_employee_id, 'late_soft_month', v_month_key, 5, v_soft_m)
    ON CONFLICT (employee_id, alert_type, period_key) DO NOTHING;
    IF FOUND THEN v_created := v_created + 1;
      FOR v_sup IN SELECT public._attendance_supervisors(p_employee_id) LOOP
        INSERT INTO public.notifications (employee_id, type, title, body, source_type, source_id, is_important)
        VALUES (v_sup, 'absence', 'Опоздания: порог за месяц',
                COALESCE(v_emp_name,'Сотрудник')||' — опозданий 5–15 мин за '||v_month_key||': '||v_soft_m||' (порог 5)',
                'attendance', p_employee_id, true);
      END LOOP;
    END IF;
  END IF;

  IF v_soft_r >= 9 THEN
    INSERT INTO public.attendance_alerts (employee_id, alert_type, period_key, threshold, actual_value)
    VALUES (p_employee_id, 'late_soft_rolling3', v_r_key, 9, v_soft_r)
    ON CONFLICT (employee_id, alert_type, period_key) DO NOTHING;
    IF FOUND THEN v_created := v_created + 1;
      FOR v_sup IN SELECT public._attendance_supervisors(p_employee_id) LOOP
        INSERT INTO public.notifications (employee_id, type, title, body, source_type, source_id, is_important)
        VALUES (v_sup, 'absence', 'Опоздания: порог за 3 месяца',
                COALESCE(v_emp_name,'Сотрудник')||' — опозданий 5–15 мин за '||v_r_key||': '||v_soft_r||' (порог 9)',
                'attendance', p_employee_id, true);
      END LOOP;
    END IF;
  END IF;

  IF v_hard_m >= 3 THEN
    INSERT INTO public.attendance_alerts (employee_id, alert_type, period_key, threshold, actual_value)
    VALUES (p_employee_id, 'late_hard_month', v_month_key, 3, v_hard_m)
    ON CONFLICT (employee_id, alert_type, period_key) DO NOTHING;
    IF FOUND THEN v_created := v_created + 1;
      FOR v_sup IN SELECT public._attendance_supervisors(p_employee_id) LOOP
        INSERT INTO public.notifications (employee_id, type, title, body, source_type, source_id, is_important)
        VALUES (v_sup, 'absence', 'Опоздания свыше 15 минут: порог за месяц',
                COALESCE(v_emp_name,'Сотрудник')||' — опозданий свыше 15 мин за '||v_month_key||': '||v_hard_m||' (порог 3)',
                'attendance', p_employee_id, true);
      END LOOP;
    END IF;
  END IF;

  RETURN v_created;
END;
$$;

-- ── Приход ────────────────────────────────────────────────────────────────────
-- Окно приёма 06:00–00:00 Asia/Bishkek. Дата всегда «сегодня» по времени компании —
-- параметра даты нет, отметить прошлое или будущее нельзя ниоткуда.
CREATE OR REPLACE FUNCTION public.register_check_in(p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_emp record;
  v_today date := public._company_today();
  v_local timestamp := (now() AT TIME ZONE 'Asia/Bishkek');
  v_minutes int := extract(hour from v_local)::int * 60 + extract(minute from v_local)::int;
  v_late int;
  v_grade text;
  v_existing record;
BEGIN
  PERFORM public._assert_actor_active(p_actor);

  SELECT id, work_start_time, work_end_time, attendance_tracked, hire_date
    INTO v_emp
  FROM public.employees
  WHERE id = p_actor AND deleted_at IS NULL AND status = 'active';

  IF v_emp.id IS NULL THEN
    RETURN jsonb_build_object('status','skip','reason','employee_not_found');
  END IF;

  IF NOT v_emp.attendance_tracked THEN
    RETURN jsonb_build_object('status','skip','reason','not_tracked');
  END IF;

  -- Окно 06:00–00:00: до 6 утра отметка не принимается.
  IF v_minutes < 360 THEN
    RETURN jsonb_build_object('status','skip','reason','outside_window');
  END IF;

  SELECT * INTO v_existing FROM public.attendance
   WHERE employee_id = p_actor AND date = v_today;
  IF v_existing.id IS NOT NULL THEN
    RETURN jsonb_build_object('status','already','attendance_id',v_existing.id);
  END IF;

  v_late := GREATEST(0, v_minutes -
    (extract(hour from v_emp.work_start_time)::int * 60 + extract(minute from v_emp.work_start_time)::int));
  v_grade := public._late_grade(v_late);

  INSERT INTO public.attendance (
    employee_id, date, status, check_in_time, check_in_source,
    planned_start, planned_end, late_minutes, late_grade, counts_as_worked, marked_by
  ) VALUES (
    p_actor, v_today,
    CASE WHEN v_grade = 'late_critical' THEN 'late_not_counted' ELSE 'worked' END,
    now(), 'app',
    v_emp.work_start_time, v_emp.work_end_time,
    v_late, v_grade,
    (v_grade <> 'late_critical'),
    NULL
  );

  PERFORM public.recompute_attendance_alerts(p_actor);

  RETURN jsonb_build_object(
    'status','checked_in', 'late_minutes', v_late, 'late_grade', v_grade,
    'counts_as_worked', (v_grade <> 'late_critical')
  );
END;
$$;

-- ── Уход ──────────────────────────────────────────────────────────────────────
-- Переработка меряется ТОЛЬКО по концу смены: ранний приход переработкой не считается
-- (подтверждено владельцем). Недоработка и переработка пишутся в разные колонки —
-- сальдировать их между днями нечем.
CREATE OR REPLACE FUNCTION public.register_check_out(p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row record;
  v_today date := public._company_today();
  v_local timestamp := (now() AT TIME ZONE 'Asia/Bishkek');
  v_now_min int := extract(hour from v_local)::int * 60 + extract(minute from v_local)::int;
  v_end_min int;
  v_worked int;
  v_over int := 0;
  v_short int := 0;
BEGIN
  PERFORM public._assert_actor_active(p_actor);

  SELECT * INTO v_row FROM public.attendance
   WHERE employee_id = p_actor AND date = v_today;

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('status','error','reason','no_check_in');
  END IF;
  IF v_row.check_out_time IS NOT NULL THEN
    RETURN jsonb_build_object('status','already');
  END IF;
  IF v_row.check_in_time IS NULL THEN
    RETURN jsonb_build_object('status','error','reason','no_check_in');
  END IF;

  v_end_min := extract(hour from v_row.planned_end)::int * 60 + extract(minute from v_row.planned_end)::int;
  v_worked := GREATEST(0, (extract(epoch from (now() - v_row.check_in_time)) / 60)::int);

  IF v_now_min > v_end_min THEN
    v_over := v_now_min - v_end_min;
  ELSIF v_now_min < v_end_min THEN
    v_short := v_end_min - v_now_min;
  END IF;

  UPDATE public.attendance
     SET check_out_time = now(),
         check_out_source = 'app',
         worked_minutes = v_worked,
         overtime_minutes = v_over,
         shortfall_minutes = v_short,
         updated_at = now()
   WHERE id = v_row.id;

  RETURN jsonb_build_object('status','checked_out','worked_minutes',v_worked,
                            'overtime_minutes',v_over,'shortfall_minutes',v_short);
END;
$$;

-- ── Подмена ───────────────────────────────────────────────────────────────────
-- Причина обязательна (и здесь, и констрейнтом БД). Деньги не затрагиваются — день
-- засчитывается вышедшему; замещаемый строки не получает.
CREATE OR REPLACE FUNCTION public.register_substitution(
  p_actor uuid, p_covering_for uuid, p_reason text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_emp record; v_cov record;
  v_today date := public._company_today();
  v_local timestamp := (now() AT TIME ZONE 'Asia/Bishkek');
  v_minutes int := extract(hour from v_local)::int * 60 + extract(minute from v_local)::int;
BEGIN
  PERFORM public._assert_actor_active(p_actor);

  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RETURN jsonb_build_object('status','error','reason','reason_required');
  END IF;
  IF p_covering_for = p_actor THEN
    RETURN jsonb_build_object('status','error','reason','self_substitution');
  END IF;

  SELECT id, work_start_time, work_end_time, attendance_tracked, department_id
    INTO v_emp FROM public.employees
   WHERE id = p_actor AND deleted_at IS NULL AND status = 'active';
  IF v_emp.id IS NULL OR NOT v_emp.attendance_tracked THEN
    RETURN jsonb_build_object('status','error','reason','not_tracked');
  END IF;

  SELECT id, department_id INTO v_cov FROM public.employees
   WHERE id = p_covering_for AND deleted_at IS NULL;
  IF v_cov.id IS NULL THEN
    RETURN jsonb_build_object('status','error','reason','covered_not_found');
  END IF;
  IF v_cov.department_id IS DISTINCT FROM v_emp.department_id THEN
    RETURN jsonb_build_object('status','error','reason','other_department');
  END IF;

  IF v_minutes < 360 THEN
    RETURN jsonb_build_object('status','error','reason','outside_window');
  END IF;

  IF EXISTS (SELECT 1 FROM public.attendance WHERE employee_id = p_actor AND date = v_today) THEN
    RETURN jsonb_build_object('status','error','reason','already_marked');
  END IF;

  INSERT INTO public.attendance (
    employee_id, date, status, check_in_time, check_in_source,
    planned_start, planned_end, late_minutes, late_grade, counts_as_worked,
    covering_for_employee_id, substitution_reason, marked_by
  ) VALUES (
    p_actor, v_today, 'worked', now(), 'app',
    v_emp.work_start_time, v_emp.work_end_time,
    0, 'on_time', true,
    p_covering_for, trim(p_reason), NULL
  );

  RETURN jsonb_build_object('status','ok');
END;
$$;

-- ── Правка владельцем ─────────────────────────────────────────────────────────
-- Единственный способ изменить строку. Комментарий обязателен; правка и запись в
-- журнал идут ОДНОЙ транзакцией, поэтому строки без объяснения не появится.
CREATE OR REPLACE FUNCTION public.correct_attendance(
  p_actor uuid, p_attendance_id uuid, p_changes jsonb, p_comment text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_scope text; v_old record; v_actor_dept uuid;
  v_status text; v_late int; v_grade text; v_counts boolean;
  v_checkin timestamptz; v_checkout timestamptz;
  v_over int; v_short int; v_worked int;
BEGIN
  PERFORM public._assert_actor_active(p_actor);

  IF p_comment IS NULL OR length(trim(p_comment)) = 0 THEN
    RETURN jsonb_build_object('status','error','reason','comment_required');
  END IF;

  v_scope := public._my_perm_scope('attendance');
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

  -- Опоздание пересчитываем от снимка смены, а не от текущего графика сотрудника.
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
    DECLARE
      v_out_min int := extract(hour from (v_checkout AT TIME ZONE 'Asia/Bishkek'))::int * 60
                       + extract(minute from (v_checkout AT TIME ZONE 'Asia/Bishkek'))::int;
      v_end_min int := extract(hour from v_old.planned_end)::int * 60
                       + extract(minute from v_old.planned_end)::int;
    BEGIN
      IF v_out_min > v_end_min THEN v_over := v_out_min - v_end_min;
      ELSIF v_out_min < v_end_min THEN v_short := v_end_min - v_out_min;
      END IF;
    END;
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

-- ── Автопрогул ────────────────────────────────────────────────────────────────
-- Через час после начала смены при отсутствии прихода. Вызывается планировщиком (080).
CREATE OR REPLACE FUNCTION public.mark_absentees()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today date := public._company_today();
  v_local timestamp := (now() AT TIME ZONE 'Asia/Bishkek');
  v_now_min int := extract(hour from v_local)::int * 60 + extract(minute from v_local)::int;
  v_count int := 0;
  r record;
BEGIN
  FOR r IN
    SELECT e.id, e.work_start_time, e.work_end_time
    FROM public.employees e
    WHERE e.deleted_at IS NULL
      AND e.status = 'active'
      AND e.attendance_tracked = true
      AND e.work_start_time IS NOT NULL
      AND (e.hire_date IS NULL OR e.hire_date <= v_today)
      AND v_now_min >= (extract(hour from e.work_start_time)::int * 60
                        + extract(minute from e.work_start_time)::int) + 60
      AND NOT EXISTS (
        SELECT 1 FROM public.attendance a
         WHERE a.employee_id = e.id AND a.date = v_today)
  LOOP
    INSERT INTO public.attendance (
      employee_id, date, status, check_in_source,
      planned_start, planned_end, late_minutes, late_grade, counts_as_worked, marked_by
    ) VALUES (
      r.id, v_today, 'absent', 'auto_system',
      r.work_start_time, r.work_end_time, 0, 'on_time', false, NULL
    )
    ON CONFLICT (employee_id, date) DO NOTHING;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ── Гранты ────────────────────────────────────────────────────────────────────
-- Вызывать может authenticated; проверки прав — внутри каждой функции.
REVOKE ALL ON FUNCTION public.register_check_in(uuid)                     FROM public;
REVOKE ALL ON FUNCTION public.register_check_out(uuid)                    FROM public;
REVOKE ALL ON FUNCTION public.register_substitution(uuid,uuid,text)       FROM public;
REVOKE ALL ON FUNCTION public.correct_attendance(uuid,uuid,jsonb,text)    FROM public;
REVOKE ALL ON FUNCTION public.get_attendance_counters(uuid,date)          FROM public;
REVOKE ALL ON FUNCTION public.mark_absentees()                            FROM public;

GRANT EXECUTE ON FUNCTION public.get_attendance_counters(uuid,date) TO authenticated;
-- Остальные вызываются только из server actions под service_role, который обходит гранты.

SET check_function_bodies = on;

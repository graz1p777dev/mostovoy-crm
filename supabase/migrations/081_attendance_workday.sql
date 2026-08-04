-- ─── 081: рабочий день по графику в SQL + предложение подмены ─────────────────
--
-- ПОЧЕМУ. В 078 register_check_in не проверял, рабочий ли сегодня день у сотрудника,
-- поэтому выход в выходной молча записывался обычным приходом, а диалог подмены
-- не появлялся никогда. Логика графика до сих пор жила только в TypeScript
-- (src/lib/decomposition/schedule.ts, isWorkDay) — здесь её SQL-зеркало.
--
-- ВАЖНО: правила обязаны совпадать с TS-версией, иначе посещаемость и нормы
-- декомпозиции разойдутся в трактовке одного и того же дня:
--   5/2        — пн–пт
--   6/1        — пн–сб
--   2/2        — цикл 4 дня от anchor, рабочие первые 2
--   3 через 1  — цикл 4 дня от anchor, рабочие первые 3
--   иное       — как 5/2 (тот же дефолт, что в TS)

CREATE OR REPLACE FUNCTION public._is_work_day(
  p_date date, p_schedule_type text, p_anchor date
)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_dow int := EXTRACT(isodow FROM p_date)::int;  -- 1=пн … 7=вс
  v_offset int;
BEGIN
  IF p_schedule_type = '6/1' THEN
    RETURN v_dow BETWEEN 1 AND 6;
  ELSIF p_schedule_type IN ('2/2', '3 через 1') THEN
    v_offset := (((p_date - COALESCE(p_anchor, p_date)) % 4) + 4) % 4;
    RETURN v_offset < CASE WHEN p_schedule_type = '2/2' THEN 2 ELSE 3 END;
  ELSE
    -- '5/2' и любой неизвестный график
    RETURN v_dow BETWEEN 1 AND 5;
  END IF;
END;
$$;

-- ── Приход: добавлена ветка выходного дня ─────────────────────────────────────
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

  SELECT id, work_start_time, work_end_time, attendance_tracked, hire_date,
         schedule_type, schedule_anchor_date
    INTO v_emp
  FROM public.employees
  WHERE id = p_actor AND deleted_at IS NULL AND status = 'active';

  IF v_emp.id IS NULL THEN
    RETURN jsonb_build_object('status','skip','reason','employee_not_found');
  END IF;

  IF NOT v_emp.attendance_tracked THEN
    RETURN jsonb_build_object('status','skip','reason','not_tracked');
  END IF;

  -- Окно 06:00–00:00 по времени компании.
  IF v_minutes < 360 THEN
    RETURN jsonb_build_object('status','skip','reason','outside_window');
  END IF;

  SELECT * INTO v_existing FROM public.attendance
   WHERE employee_id = p_actor AND date = v_today;
  IF v_existing.id IS NOT NULL THEN
    RETURN jsonb_build_object('status','already','attendance_id',v_existing.id);
  END IF;

  -- Выходной по графику: обычный приход не пишем, предлагаем отметить подмену.
  -- Без этой ветки выход в выходной засчитывался как рядовой рабочий день.
  IF NOT public._is_work_day(v_today, COALESCE(v_emp.schedule_type,'5/2'),
                             COALESCE(v_emp.schedule_anchor_date, v_emp.hire_date)) THEN
    RETURN jsonb_build_object('status','skip','reason','day_off');
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

-- ── Автопрогул: тоже только по рабочим дням графика ───────────────────────────
-- Иначе выходные превращались бы в прогулы.
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
      AND public._is_work_day(v_today, COALESCE(e.schedule_type,'5/2'),
                              COALESCE(e.schedule_anchor_date, e.hire_date))
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

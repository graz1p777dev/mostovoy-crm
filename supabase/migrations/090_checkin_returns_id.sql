-- ─── 090: register_check_in возвращает id записи и признак «нужна причина» ─────
--
-- Нужно для обязательной причины опоздания. Владелец потребовал спрашивать причину
-- В МОМЕНТ прихода, а не потом: экран сразу после отметки показывает поле, которое
-- нельзя пропустить, и записывает ответ в ту же строку. Без id записи клиент не
-- знает, к какому дню привязывать причину.
--
-- Тело взято из действующей версии (078 + ветка выходного из 081) без изменений
-- логики. Меняется ТОЛЬКО состав возвращаемого jsonb: добавлены attendance_id,
-- needs_reason и needs_note. Сигнатура и тип возврата прежние, существующие вызовы
-- (читают status / late_minutes / late_grade) продолжают работать.
--
-- Система не решает, уважительна ли причина, — она её только фиксирует. Порог:
-- причина с 5 минут (до этого грейд on_time, опоздания нет), рукописная
-- объяснительная — свыше 15 минут (грейды late_hard / late_critical).

CREATE OR REPLACE FUNCTION public.register_check_in(p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_emp record;
  v_today date := public._company_today();
  v_local timestamp := (now() AT TIME ZONE 'Asia/Bishkek');
  v_minutes int := extract(hour from v_local)::int * 60 + extract(minute from v_local)::int;
  v_late int;
  v_grade text;
  v_existing record;
  v_id uuid;
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
    -- Причину могли не дописать (закрыли вкладку) — экран спросит её снова.
    RETURN jsonb_build_object('status','already',
      'attendance_id', v_existing.id,
      'late_minutes', COALESCE(v_existing.late_minutes, 0),
      'needs_reason', (COALESCE(v_existing.late_minutes,0) >= 5
                       AND v_existing.late_reason IS NULL),
      'needs_note', (v_existing.late_grade IN ('late_hard','late_critical')));
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
  )
  RETURNING id INTO v_id;

  PERFORM public.recompute_attendance_alerts(p_actor);

  RETURN jsonb_build_object(
    'status','checked_in', 'late_minutes', v_late, 'late_grade', v_grade,
    'counts_as_worked', (v_grade <> 'late_critical'),
    'attendance_id', v_id,
    'needs_reason', (v_late >= 5),
    'needs_note', (v_grade IN ('late_hard','late_critical'))
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.register_check_in(uuid) FROM public;

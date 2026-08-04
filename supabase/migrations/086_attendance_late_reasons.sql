-- ─── 085: причины опозданий, фиксируемые в момент прихода ─────────────────────
--
-- ПРИНЦИП ВЛАДЕЛЬЦА: система НЕ судит, уважительна ли причина. Любая попытка это
-- автоматизировать научила бы людей подбирать слова, которые система принимает.
-- Поэтому здесь только фиксация факта: текст записывается в момент прихода,
-- задним числом не меняется, а решение принимает человек.
--
-- ЧТО ЗА ЧЕМ:
--   опоздание 1–5 мин   → прощается, причина не спрашивается;
--   опоздание 5–15 мин  → причина обязательна, счётчик растёт, бумаги не нужно;
--   опоздание свыше 15  → причина обязательна И нужна рукописная объяснительная;
--   3 опоздания 5–15 за месяц → сигнал владельцу «посмотри причины разом».
--
-- НЕИЗМЕНЯЕМОСТЬ. «Записывается в тот момент, не редактируется потом» — это
-- гарантия триггера, а не соглашение в коде: однажды заполненный текст нельзя
-- изменить ничем, включая правку владельца. Владелец может изменить сам день
-- (статус, время), но не переписать объяснение сотрудника задним числом.

ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS late_reason text,
  ADD COLUMN IF NOT EXISTS late_reason_at timestamptz;

COMMENT ON COLUMN public.attendance.late_reason IS
  'Причина опоздания со слов сотрудника, зафиксированная в момент прихода. '
  'После заполнения неизменяема (триггер trg_attendance_late_reason_immutable).';

-- ── Неизменяемость ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._late_reason_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.late_reason IS NOT NULL
     AND NEW.late_reason IS DISTINCT FROM OLD.late_reason THEN
    RAISE EXCEPTION 'late_reason_immutable: причина опоздания задним числом не меняется';
  END IF;
  -- Отметку времени фиксации тоже не переписываем.
  IF OLD.late_reason_at IS NOT NULL
     AND NEW.late_reason_at IS DISTINCT FROM OLD.late_reason_at THEN
    NEW.late_reason_at := OLD.late_reason_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_attendance_late_reason_immutable ON public.attendance;
CREATE TRIGGER trg_attendance_late_reason_immutable
  BEFORE UPDATE ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public._late_reason_immutable();

-- ── Запись причины ────────────────────────────────────────────────────────────
-- Отдельная функция, а не параметр register_check_in: факт прихода фиксируется
-- сразу и безусловно (иначе закрытая вкладка привела бы к автопрогулу вместо
-- опоздания), а причина спрашивается следом блокирующим окном.
CREATE OR REPLACE FUNCTION public.record_late_reason(
  p_actor uuid, p_attendance_id uuid, p_reason text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row record;
BEGIN
  PERFORM public._assert_actor_active(p_actor);

  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RETURN jsonb_build_object('status','error','reason','reason_required');
  END IF;

  SELECT * INTO v_row FROM public.attendance WHERE id = p_attendance_id;
  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('status','error','reason','not_found');
  END IF;

  -- Причину указывает ТОЛЬКО сам сотрудник о себе.
  IF v_row.employee_id <> p_actor THEN
    RETURN jsonb_build_object('status','error','reason','not_your_record');
  END IF;

  IF v_row.late_reason IS NOT NULL THEN
    RETURN jsonb_build_object('status','already');
  END IF;

  UPDATE public.attendance
     SET late_reason = trim(p_reason),
         late_reason_at = now(),
         updated_at = now()
   WHERE id = p_attendance_id;

  RETURN jsonb_build_object('status','ok');
END;
$$;

-- ── Сигнал «посмотри причины разом» ───────────────────────────────────────────
-- Отдельный тип сигнала, НЕ замена дисциплинарному порогу фазы 1 (5 за месяц).
-- Смысл другой: не «пора принимать меры», а «набралось три — посмотри причины
-- вместе и реши сам». Дисциплинарные пороги 5 / 9 / 3 остались как были.
ALTER TABLE public.attendance_alerts DROP CONSTRAINT IF EXISTS attendance_alerts_type_check;
ALTER TABLE public.attendance_alerts ADD CONSTRAINT attendance_alerts_type_check CHECK (
  alert_type IN ('late_soft_month','late_soft_rolling3','late_hard_month','late_soft_review_month')
);

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

  -- НОВОЕ: разбор причин при трёх мягких опозданиях за месяц.
  IF v_soft_m >= 3 THEN
    INSERT INTO public.attendance_alerts (employee_id, alert_type, period_key, threshold, actual_value)
    VALUES (p_employee_id, 'late_soft_review_month', v_month_key, 3, v_soft_m)
    ON CONFLICT (employee_id, alert_type, period_key) DO NOTHING;
    IF FOUND THEN v_created := v_created + 1;
      FOR v_sup IN SELECT public._attendance_supervisors(p_employee_id) LOOP
        INSERT INTO public.notifications (employee_id, type, title, body, source_type, source_id, is_important)
        VALUES (v_sup, 'absence', 'Опоздания: посмотрите причины',
                COALESCE(v_emp_name,'Сотрудник')||' — опозданий 5–15 мин за '||v_month_key||': '||v_soft_m
                ||'. Причины записаны при приходе, посмотрите их вместе.',
                'attendance', p_employee_id, false);
      END LOOP;
    END IF;
  END IF;

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

-- ── Причины одного сотрудника в одном месте ───────────────────────────────────
-- «Чтобы судить по картине, а не по отдельным случаям». Только для управляющих:
-- область берётся по актору (не по JWT — server actions ходят под service_role).
CREATE OR REPLACE FUNCTION public.get_late_reasons(
  p_actor uuid, p_employee_id uuid, p_months integer DEFAULT 3
)
RETURNS TABLE (
  attendance_id uuid,
  date          date,
  late_minutes  integer,
  late_grade    text,
  reason        text,
  reason_at     timestamptz,
  needs_note    boolean,
  note_uploaded boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_scope text; v_actor_dept uuid;
  v_from date := (date_trunc('month', public._company_today())
                  - make_interval(months => GREATEST(p_months,1) - 1))::date;
BEGIN
  v_scope := public._perm_scope_for(p_actor, 'attendance');
  IF v_scope IS NULL OR v_scope NOT IN ('team','all') THEN
    RETURN;   -- fail-closed: сотруднику чужие причины не видны
  END IF;

  IF v_scope = 'team' THEN
    SELECT department_id INTO v_actor_dept FROM public.employees WHERE id = p_actor;
    IF NOT EXISTS (SELECT 1 FROM public.employees
                    WHERE id = p_employee_id AND department_id = v_actor_dept) THEN
      RETURN;
    END IF;
  END IF;

  RETURN QUERY
  SELECT a.id, a.date, a.late_minutes, a.late_grade,
         a.late_reason, a.late_reason_at,
         (a.late_grade IN ('late_hard','late_critical')),
         EXISTS (SELECT 1 FROM public.attendance_explanations e WHERE e.attendance_id = a.id)
  FROM public.attendance a
  WHERE a.employee_id = p_employee_id
    AND a.date >= v_from
    AND a.late_grade IN ('late_soft','late_hard','late_critical')
  ORDER BY a.date DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.record_late_reason(uuid,uuid,text) FROM public;
REVOKE ALL ON FUNCTION public.get_late_reasons(uuid,uuid,integer) FROM public;

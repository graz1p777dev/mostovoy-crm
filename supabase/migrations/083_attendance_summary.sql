-- ─── 083: сводка по посещаемости для экрана контроля ──────────────────────────
--
-- Одна функция вместо вызова get_attendance_counters по каждому сотруднику:
-- экран контроля показывает всех разом, и N+1 здесь был бы особенно дорог —
-- каждый round-trip до БД стоит ~180 мс (см. docs/reports/2026-07-29-region-latency.md).
--
-- ДОСТУП. Проверка та же, что у остальных управляющих функций: область прав
-- АКТОРА по таблице permissions (_perm_scope_for, миграция 082), а не по JWT —
-- server actions ходят под service_role, где JWT нет. Не-управляющий получает
-- пустой результат, а не отказ: экран для него просто не существует.
--
-- «НЕОТМЕЧЕННАЯ ПОДМЕНА» — выход в день, который по графику нерабочий, без
-- covering_for_employee_id. По правилам владельца это нарушение: подмену обязаны
-- отмечать. Раньше такой день был неотличим от обычного.

CREATE OR REPLACE FUNCTION public.get_attendance_summary(
  p_actor uuid,
  p_year  integer,
  p_month integer
)
RETURNS TABLE (
  employee_id        uuid,
  employee_name      text,
  role_label         text,
  soft_month         integer,
  soft_rolling3      integer,
  hard_month         integer,
  absences_month     integer,
  open_days_month    integer,
  unmarked_subs      integer,
  worked_days_month  integer,
  overtime_month     integer,
  shortfall_month    integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_scope text;
  v_actor_dept uuid;
  v_m_start date := make_date(p_year, p_month, 1);
  v_m_end   date := (make_date(p_year, p_month, 1) + interval '1 month - 1 day')::date;
  v_r_start date := (make_date(p_year, p_month, 1) - interval '2 months')::date;
BEGIN
  v_scope := public._perm_scope_for(p_actor, 'attendance');
  IF v_scope IS NULL OR v_scope NOT IN ('team','all') THEN
    RETURN;  -- fail-closed: сотруднику эти цифры не видны никогда
  END IF;

  SELECT department_id INTO v_actor_dept FROM public.employees WHERE id = p_actor;

  RETURN QUERY
  SELECT
    e.id,
    e.name::text,
    COALESCE(r.label, e.role)::text,
    (SELECT count(*)::integer FROM public.attendance a
      WHERE a.employee_id = e.id AND a.date BETWEEN v_m_start AND v_m_end
        AND a.late_grade = 'late_soft'),
    (SELECT count(*)::integer FROM public.attendance a
      WHERE a.employee_id = e.id AND a.date BETWEEN v_r_start AND v_m_end
        AND a.late_grade = 'late_soft'),
    -- жёсткий счётчик включает и >30 (подтверждено владельцем)
    (SELECT count(*)::integer FROM public.attendance a
      WHERE a.employee_id = e.id AND a.date BETWEEN v_m_start AND v_m_end
        AND a.late_grade IN ('late_hard','late_critical')),
    (SELECT count(*)::integer FROM public.attendance a
      WHERE a.employee_id = e.id AND a.date BETWEEN v_m_start AND v_m_end
        AND a.status = 'absent'),
    -- незакрытые дни: пришёл, но не нажал «Закончить смену»
    (SELECT count(*)::integer FROM public.attendance a
      WHERE a.employee_id = e.id AND a.date BETWEEN v_m_start AND v_m_end
        AND a.check_in_time IS NOT NULL AND a.check_out_time IS NULL),
    -- неотмеченные подмены: вышел в нерабочий по графику день без отметки подмены
    (SELECT count(*)::integer FROM public.attendance a
      WHERE a.employee_id = e.id AND a.date BETWEEN v_m_start AND v_m_end
        AND a.covering_for_employee_id IS NULL
        AND a.check_in_time IS NOT NULL
        AND NOT public._is_work_day(a.date, COALESCE(e.schedule_type,'5/2'),
                                    COALESCE(e.schedule_anchor_date, e.hire_date))),
    (SELECT count(*)::integer FROM public.attendance a
      WHERE a.employee_id = e.id AND a.date BETWEEN v_m_start AND v_m_end
        AND a.counts_as_worked),
    (SELECT COALESCE(sum(a.overtime_minutes),0)::integer FROM public.attendance a
      WHERE a.employee_id = e.id AND a.date BETWEEN v_m_start AND v_m_end),
    (SELECT COALESCE(sum(a.shortfall_minutes),0)::integer FROM public.attendance a
      WHERE a.employee_id = e.id AND a.date BETWEEN v_m_start AND v_m_end)
  FROM public.employees e
  LEFT JOIN public.roles r ON r.name = e.role AND r.deleted_at IS NULL
  WHERE e.deleted_at IS NULL
    AND e.attendance_tracked = true
    AND (v_scope = 'all' OR e.department_id IS NOT DISTINCT FROM v_actor_dept)
  ORDER BY e.name;
END;
$$;

REVOKE ALL ON FUNCTION public.get_attendance_summary(uuid,integer,integer) FROM public;

COMMENT ON FUNCTION public.get_attendance_summary(uuid,integer,integer) IS
  'Сводка контроля посещаемости. Только для ролей с attendance-областью team/all; '
  'остальным возвращает пусто (fail-closed, а не отказ).';

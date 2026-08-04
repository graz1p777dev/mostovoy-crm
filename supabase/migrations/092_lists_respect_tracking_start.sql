-- ─── 092: списки причин и объяснительных уважают границу учёта ────────────────
--
-- НАЙДЕНО при проходе по экранам под владельцем. Вкладка «Объяснительные»
-- требовала бумагу с двух человек за 17 и 23 июля — при том, что учёт
-- посещаемости НИКОГДА никому не включался, а само правило об объяснительных
-- появилось только 2026-07-30. Система требовала документ за дни, когда такого
-- требования не существовало.
--
-- Причина: границу учёта (employees.attendance_tracked_since, миграция 084) знал
-- только табель. Списки причин и должников по объяснительным её не знали и
-- считали доказательством любые старые строки — остатки данных до фазы 1.
-- Непоследовательность: одна и та же дата в табеле была пустой клеткой, а здесь
-- превращалась в долг.
--
-- Теперь обе функции отсекают всё, что раньше границы. Если учёт по сотруднику
-- ни разу не включали (tracked_since IS NULL), он не должен ничего и не
-- показывается вовсе — отсутствие записей о нём ничего не доказывает.
--
-- Тела взяты из действующих версий дословно (pg_get_functiondef); добавлено
-- только условие границы в WHERE.

CREATE OR REPLACE FUNCTION public.get_explanation_status(p_actor uuid, p_year integer, p_month integer)
 RETURNS TABLE(attendance_id uuid, employee_id uuid, employee_name text, date date, late_minutes integer, reason text, uploaded boolean, storage_path text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_scope text; v_actor_dept uuid;
  v_from date := make_date(p_year, p_month, 1);
  v_to   date := (make_date(p_year, p_month, 1) + interval '1 month - 1 day')::date;
BEGIN
  v_scope := public._perm_scope_for(p_actor, 'attendance');
  IF v_scope IS NULL OR v_scope NOT IN ('team','all') THEN
    RETURN;   -- fail-closed
  END IF;

  SELECT department_id INTO v_actor_dept FROM public.employees WHERE id = p_actor;

  RETURN QUERY
  SELECT a.id, a.employee_id, e.name::text, a.date, a.late_minutes, a.late_reason,
         (x.id IS NOT NULL), x.storage_path
  FROM public.attendance a
  JOIN public.employees e ON e.id = a.employee_id
  LEFT JOIN public.attendance_explanations x ON x.attendance_id = a.id
  WHERE a.date BETWEEN v_from AND v_to
    -- объяснительная нужна только при опоздании свыше 15 минут
    AND a.late_grade IN ('late_hard','late_critical')
    -- Граница учёта: до неё правил об объяснительных не существовало.
    AND e.attendance_tracked_since IS NOT NULL
    AND a.date >= e.attendance_tracked_since
    AND (v_scope = 'all' OR e.department_id IS NOT DISTINCT FROM v_actor_dept)
  ORDER BY (x.id IS NOT NULL), a.date DESC;   -- сначала должники
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_late_reasons(p_actor uuid, p_employee_id uuid, p_months integer DEFAULT 3)
 RETURNS TABLE(attendance_id uuid, date date, late_minutes integer, late_grade text, reason text, reason_at timestamp with time zone, needs_note boolean, note_uploaded boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- Та же граница учёта, что и в табеле: старые дни ничего не доказывают.
    AND a.date >= (SELECT e.attendance_tracked_since FROM public.employees e
                    WHERE e.id = p_employee_id)
  ORDER BY a.date DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_explanation_status(uuid,integer,integer) FROM public;
REVOKE ALL ON FUNCTION public.get_late_reasons(uuid,uuid,integer) FROM public;

-- ─── 058: RLS по РЕАЛЬНОЙ матрице прав (permissions), а не по имени роли ────────
--
-- Блокер [P1]: consultations_select_managers (057) разрешала чтение по ИМЕНИ роли
-- (get_my_role() IN ('mp','lmai')), не читая permissions.can_view/scope, которые владелец
-- меняет через панель (savePermissionsForRole). Следствие: снятие can_view не отбирало
-- доступ через Data API; смена scope all→own/team не сужала выдачу; кастомная роль с
-- can_view=true доступа НЕ получала (имя не mp/lmai). Панель прав — ложный контроль.
--
-- Свип по всем per-employee таблицам показал ТОТ ЖЕ класс (политики по имени роли/
-- permission_level с зашитым scope) на: decomposition (daily_activity, sales_plan_weekly),
-- marketing (marketing_daily_data), attendance, documents (+storage.objects), salaries
-- (salaries, salary_calculations, advance_payments, employee_kpi, employee_kpi_results,
-- employee_kpi_item_results). Единственная ПЕРЕ-выдача (scope=all по имени) была только на
-- consultations; остальные отдавали own/team — но всё равно игнорировали can_view и не
-- поддерживали кастомные роли. Приводим ВСЕ к единому permissions-driven паттерну.
-- (employees/tasks/notifications вынесены в follow-up — см. отчёт: identity-таблица /
-- двойное владение created_by|assigned_to / низкая чувствительность; over-выдачи нет.)

-- ══ Хелпер: scope текущего АКТИВНОГО сотрудника по ресурсу (STABLE, кэшируется) ══
-- Возвращает 'all'|'team'|'own' если для роли есть РОВНО ОДНА строка permissions по ресурсу
-- И can_view=true; иначе NULL (fail-closed): нет активного сотрудника / роль удалена /
-- строки нет / дубликат / can_view=false. SECDEF (обходит RLS при чтении permissions),
-- STABLE — планировщик вычисляет один раз на запрос (перф по образцу get_my_*).
CREATE OR REPLACE FUNCTION public._my_perm_scope(p_resource text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE WHEN count(*) = 1 AND bool_and(p.can_view) THEN max(p.scope) ELSE NULL END
  FROM public.employees e
  JOIN public.roles r        ON r.name = e.role AND r.deleted_at IS NULL
  JOIN public.permissions p  ON p.role_id = r.id AND p.resource = p_resource
  WHERE e.user_id = auth.uid() AND e.deleted_at IS NULL AND e.status IN ('active','probation');
$$;
REVOKE ALL ON FUNCTION public._my_perm_scope(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._my_perm_scope(text) TO authenticated, service_role;

-- ══ 1. consultations (resource=consultations, владелец=manager_id) — P1 ══════════
DROP POLICY IF EXISTS consultations_select_owner          ON public.consultations;
DROP POLICY IF EXISTS consultations_select_dept_head_perm ON public.consultations;
DROP POLICY IF EXISTS consultations_select_managers       ON public.consultations;
CREATE POLICY consultations_select_by_perm ON public.consultations FOR SELECT TO authenticated
USING (
  deleted_at IS NULL AND (
       public._my_perm_scope('consultations') = 'all'
    OR (public._my_perm_scope('consultations') = 'team' AND manager_id IN (
          SELECT e.id FROM public.employees e
          WHERE e.department_id = public.get_my_department_id() AND e.deleted_at IS NULL))
    OR (public._my_perm_scope('consultations') = 'own'  AND manager_id = public.get_my_employee_id())
  )
);

-- ══ 2. decomposition: daily_activity, sales_plan_weekly (владелец=employee_id) ════
DROP POLICY IF EXISTS daily_activity_select_owner     ON public.daily_activity;
DROP POLICY IF EXISTS daily_activity_select_dept_head ON public.daily_activity;
DROP POLICY IF EXISTS daily_activity_select_self      ON public.daily_activity;
CREATE POLICY daily_activity_select_by_perm ON public.daily_activity FOR SELECT TO authenticated
USING (
     public._my_perm_scope('decomposition') = 'all'
  OR (public._my_perm_scope('decomposition') = 'team' AND employee_id IN (
        SELECT e.id FROM public.employees e WHERE e.department_id = public.get_my_department_id() AND e.deleted_at IS NULL))
  OR (public._my_perm_scope('decomposition') = 'own'  AND employee_id = public.get_my_employee_id())
);

DROP POLICY IF EXISTS decomposition_select_dept_head_perm ON public.sales_plan_weekly;
DROP POLICY IF EXISTS decomposition_select_employee_perm  ON public.sales_plan_weekly;
DROP POLICY IF EXISTS decomposition_select_self           ON public.sales_plan_weekly;
DROP POLICY IF EXISTS sales_plan_weekly_select_owner      ON public.sales_plan_weekly;
CREATE POLICY sales_plan_weekly_select_by_perm ON public.sales_plan_weekly FOR SELECT TO authenticated
USING (
     public._my_perm_scope('decomposition') = 'all'
  OR (public._my_perm_scope('decomposition') = 'team' AND employee_id IN (
        SELECT e.id FROM public.employees e WHERE e.department_id = public.get_my_department_id() AND e.deleted_at IS NULL))
  OR (public._my_perm_scope('decomposition') = 'own'  AND employee_id = public.get_my_employee_id())
);

-- ══ 3. marketing: marketing_daily_data (владелец=employee_id) ════════════════════
DROP POLICY IF EXISTS marketing_daily_data_select_owner     ON public.marketing_daily_data;
DROP POLICY IF EXISTS marketing_daily_data_select_dept_head ON public.marketing_daily_data;
DROP POLICY IF EXISTS marketing_daily_data_select_self      ON public.marketing_daily_data;
CREATE POLICY marketing_daily_data_select_by_perm ON public.marketing_daily_data FOR SELECT TO authenticated
USING (
     public._my_perm_scope('marketing') = 'all'
  OR (public._my_perm_scope('marketing') = 'team' AND employee_id IN (
        SELECT e.id FROM public.employees e WHERE e.department_id = public.get_my_department_id() AND e.deleted_at IS NULL))
  OR (public._my_perm_scope('marketing') = 'own'  AND employee_id = public.get_my_employee_id())
);

-- ══ 4. attendance (владелец=employee_id) — субсумирует accountant→own из 056 ══════
DROP POLICY IF EXISTS attendance_select_owner          ON public.attendance;
DROP POLICY IF EXISTS attendance_select_accountant_own ON public.attendance;
DROP POLICY IF EXISTS attendance_select_dept_head_perm ON public.attendance;
DROP POLICY IF EXISTS attendance_select_employee_perm  ON public.attendance;
DROP POLICY IF EXISTS attendance_select_self           ON public.attendance;
CREATE POLICY attendance_select_by_perm ON public.attendance FOR SELECT TO authenticated
USING (
     public._my_perm_scope('attendance') = 'all'
  OR (public._my_perm_scope('attendance') = 'team' AND employee_id IN (
        SELECT e.id FROM public.employees e WHERE e.department_id = public.get_my_department_id() AND e.deleted_at IS NULL))
  OR (public._my_perm_scope('attendance') = 'own'  AND employee_id = public.get_my_employee_id())
);

-- ══ 5. documents (владелец=uploaded_by) + storage.objects (файлы бакета documents) ══
DROP POLICY IF EXISTS documents_select_owner_accountant ON public.documents;
DROP POLICY IF EXISTS documents_select_dept_head        ON public.documents;
DROP POLICY IF EXISTS documents_select_self             ON public.documents;
CREATE POLICY documents_select_by_perm ON public.documents FOR SELECT TO authenticated
USING (
  deleted_at IS NULL AND (
       public._my_perm_scope('documents') = 'all'
    OR (public._my_perm_scope('documents') = 'team' AND uploaded_by IN (
          SELECT e.id FROM public.employees e WHERE e.department_id = public.get_my_department_id() AND e.deleted_at IS NULL))
    OR (public._my_perm_scope('documents') = 'own'  AND uploaded_by = public.get_my_employee_id())
  )
);

DROP POLICY IF EXISTS documents_objects_select_owner_accountant ON storage.objects;
DROP POLICY IF EXISTS documents_objects_select_dept_head        ON storage.objects;
DROP POLICY IF EXISTS documents_objects_select_self             ON storage.objects;
CREATE POLICY documents_objects_select_by_perm ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'documents' AND (
       public._my_perm_scope('documents') = 'all'
    OR (public._my_perm_scope('documents') = 'team' AND EXISTS (
          SELECT 1 FROM public.documents d JOIN public.employees e ON e.id = d.uploaded_by
          WHERE d.storage_path = objects.name AND e.department_id = public.get_my_department_id()
            AND e.deleted_at IS NULL AND d.deleted_at IS NULL))
    OR (public._my_perm_scope('documents') = 'own'  AND EXISTS (
          SELECT 1 FROM public.documents d
          WHERE d.storage_path = objects.name AND d.uploaded_by = public.get_my_employee_id()
            AND d.deleted_at IS NULL))
  )
);

-- ══ 6. salaries-семейство (resource=salaries) ═══════════════════════════════════
-- salaries / advance_payments / employee_kpi(+results/item_results): владелец=employee_id.
DROP POLICY IF EXISTS salaries_select_owner_accountant ON public.salaries;
DROP POLICY IF EXISTS salaries_select_rop              ON public.salaries;
DROP POLICY IF EXISTS salaries_select_self             ON public.salaries;
CREATE POLICY salaries_select_by_perm ON public.salaries FOR SELECT TO authenticated
USING (
     public._my_perm_scope('salaries') = 'all'
  OR (public._my_perm_scope('salaries') = 'team' AND employee_id IN (
        SELECT e.id FROM public.employees e WHERE e.department_id = public.get_my_department_id() AND e.deleted_at IS NULL))
  OR (public._my_perm_scope('salaries') = 'own'  AND employee_id = public.get_my_employee_id())
);

DROP POLICY IF EXISTS advance_payments_select_admin ON public.advance_payments;
DROP POLICY IF EXISTS advance_payments_select_own   ON public.advance_payments;
DROP POLICY IF EXISTS advance_payments_select_team  ON public.advance_payments;
CREATE POLICY advance_payments_select_by_perm ON public.advance_payments FOR SELECT TO authenticated
USING (
     public._my_perm_scope('salaries') = 'all'
  OR (public._my_perm_scope('salaries') = 'team' AND employee_id IN (
        SELECT e.id FROM public.employees e WHERE e.department_id = public.get_my_department_id() AND e.deleted_at IS NULL))
  OR (public._my_perm_scope('salaries') = 'own'  AND employee_id = public.get_my_employee_id())
);

DROP POLICY IF EXISTS employee_kpi_select_owner_accountant ON public.employee_kpi;
DROP POLICY IF EXISTS employee_kpi_select_dept_head_perm   ON public.employee_kpi;
DROP POLICY IF EXISTS employee_kpi_select_employee_perm    ON public.employee_kpi;
DROP POLICY IF EXISTS employee_kpi_select_self             ON public.employee_kpi;
CREATE POLICY employee_kpi_select_by_perm ON public.employee_kpi FOR SELECT TO authenticated
USING (
     public._my_perm_scope('salaries') = 'all'
  OR (public._my_perm_scope('salaries') = 'team' AND employee_id IN (
        SELECT e.id FROM public.employees e WHERE e.department_id = public.get_my_department_id() AND e.deleted_at IS NULL))
  OR (public._my_perm_scope('salaries') = 'own'  AND employee_id = public.get_my_employee_id())
);

DROP POLICY IF EXISTS kpi_results_select_admin ON public.employee_kpi_results;
DROP POLICY IF EXISTS kpi_results_select_own   ON public.employee_kpi_results;
DROP POLICY IF EXISTS kpi_results_select_team  ON public.employee_kpi_results;
CREATE POLICY employee_kpi_results_select_by_perm ON public.employee_kpi_results FOR SELECT TO authenticated
USING (
     public._my_perm_scope('salaries') = 'all'
  OR (public._my_perm_scope('salaries') = 'team' AND employee_id IN (
        SELECT e.id FROM public.employees e WHERE e.department_id = public.get_my_department_id() AND e.deleted_at IS NULL))
  OR (public._my_perm_scope('salaries') = 'own'  AND employee_id = public.get_my_employee_id())
);

DROP POLICY IF EXISTS kpi_item_results_select_admin ON public.employee_kpi_item_results;
DROP POLICY IF EXISTS kpi_item_results_select_own   ON public.employee_kpi_item_results;
DROP POLICY IF EXISTS kpi_item_results_select_team  ON public.employee_kpi_item_results;
CREATE POLICY employee_kpi_item_results_select_by_perm ON public.employee_kpi_item_results FOR SELECT TO authenticated
USING (
     public._my_perm_scope('salaries') = 'all'
  OR (public._my_perm_scope('salaries') = 'team' AND employee_id IN (
        SELECT e.id FROM public.employees e WHERE e.department_id = public.get_my_department_id() AND e.deleted_at IS NULL))
  OR (public._my_perm_scope('salaries') = 'own'  AND employee_id = public.get_my_employee_id())
);

-- salary_calculations: владение косвенное (через salaries.salary_id → salaries.employee_id).
DROP POLICY IF EXISTS salary_calc_select_owner_accountant ON public.salary_calculations;
DROP POLICY IF EXISTS salary_calc_select_rop              ON public.salary_calculations;
DROP POLICY IF EXISTS salary_calc_select_self             ON public.salary_calculations;
CREATE POLICY salary_calculations_select_by_perm ON public.salary_calculations FOR SELECT TO authenticated
USING (
     public._my_perm_scope('salaries') = 'all'
  OR (public._my_perm_scope('salaries') = 'team' AND EXISTS (
        SELECT 1 FROM public.salaries s JOIN public.employees e ON e.id = s.employee_id
        WHERE s.id = salary_calculations.salary_id AND e.department_id = public.get_my_department_id() AND e.deleted_at IS NULL))
  OR (public._my_perm_scope('salaries') = 'own'  AND EXISTS (
        SELECT 1 FROM public.salaries s
        WHERE s.id = salary_calculations.salary_id AND s.employee_id = public.get_my_employee_id()))
);

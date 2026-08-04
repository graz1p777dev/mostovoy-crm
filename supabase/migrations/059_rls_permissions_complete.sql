-- ─── 059: ЗАВЕРШЕНИЕ permissions-driven RLS + perf-обёртка + team без RLS-зависимости ─
--
-- 058 перевёл на _my_perm_scope только per-employee data-таблицы; таблицы «follow-up»
-- остались по имени роли/permission_level ИЛИ USING(true). Худший случай — company_plans:
-- USING(true) => план компании (выручка/средний чек/конверсии) читал КТО УГОДНО через Data
-- API, минуя decomposition.view. Здесь — ПОЛНОЕ соответствие RLS↔RBAC по ВСЕМ таблицам
-- (полная таблица resource→tables с вердиктом — в docs/MAINTENANCE_ROLLOUT_044_059.md).
--
-- Модели: per-employee (scope all/team/own по владельцу строки) и company-level (одна запись
-- на компанию — видно, если ресурс просматривается: _my_perm_scope(R) IS NOT NULL).
--
-- NOTE #9 (perf): все вызовы обёрнуты в (SELECT ...) → InitPlan один раз на STATEMENT.
-- NOTE #11 (team через RLS): подзапрос «сотрудники моего отдела» РАНЬШЕ читал employees под
-- RLS вызывающего — кастомная роль с scope=team, но без прав на employees, недополучала отдел.
-- Теперь принадлежность отделу/владельцу резолвится SECDEF-хелперами (обходят RLS).

-- ══ SECDEF-хелперы (RLS-независимые) для team/own ══════════════════════════════
CREATE OR REPLACE FUNCTION public._my_dept_employee_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
  SELECT e.id FROM public.employees e
  WHERE e.department_id = (SELECT public.get_my_department_id()) AND e.deleted_at IS NULL;
$$;
REVOKE ALL ON FUNCTION public._my_dept_employee_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._my_dept_employee_ids() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public._salary_employee(p_salary_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$ SELECT employee_id FROM public.salaries WHERE id = p_salary_id; $$;
REVOKE ALL ON FUNCTION public._salary_employee(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._salary_employee(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public._document_uploader(p_name text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$ SELECT uploaded_by FROM public.documents WHERE storage_path = p_name AND deleted_at IS NULL LIMIT 1; $$;
REVOKE ALL ON FUNCTION public._document_uploader(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._document_uploader(text) TO authenticated, service_role;

-- ══ A. COMPANY-LEVEL (видно, если ресурс просматривается) ═══════════════════════
DROP POLICY IF EXISTS company_plans_select ON public.company_plans;
DROP POLICY IF EXISTS company_plans_select_by_perm ON public.company_plans;
CREATE POLICY company_plans_select_by_perm ON public.company_plans FOR SELECT TO authenticated
  USING ((SELECT public._my_perm_scope('decomposition')) IS NOT NULL);

DROP POLICY IF EXISTS marketing_plans_select ON public.marketing_plans;
DROP POLICY IF EXISTS marketing_plans_select_by_perm ON public.marketing_plans;
CREATE POLICY marketing_plans_select_by_perm ON public.marketing_plans FOR SELECT TO authenticated
  USING ((SELECT public._my_perm_scope('marketing')) IS NOT NULL);

DROP POLICY IF EXISTS fin_trans_select_owner_accountant ON public.finance_transactions;
DROP POLICY IF EXISTS finance_transactions_select_by_perm ON public.finance_transactions;
CREATE POLICY finance_transactions_select_by_perm ON public.finance_transactions FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND (SELECT public._my_perm_scope('finances')) IS NOT NULL);
DROP POLICY IF EXISTS finances_select_owner_accountant ON public.finance_periods;
DROP POLICY IF EXISTS finance_periods_select_by_perm ON public.finance_periods;
CREATE POLICY finance_periods_select_by_perm ON public.finance_periods FOR SELECT TO authenticated
  USING ((SELECT public._my_perm_scope('finances')) IS NOT NULL);
DROP POLICY IF EXISTS finance_cat_select_owner_accountant_rop ON public.finance_categories;
DROP POLICY IF EXISTS finance_categories_select_by_perm ON public.finance_categories;
CREATE POLICY finance_categories_select_by_perm ON public.finance_categories FOR SELECT TO authenticated
  USING ((SELECT public._my_perm_scope('finances')) IS NOT NULL);

DROP POLICY IF EXISTS integrations_select_owner ON public.integrations;
DROP POLICY IF EXISTS integrations_select_by_perm ON public.integrations;
CREATE POLICY integrations_select_by_perm ON public.integrations FOR SELECT TO authenticated
  USING ((SELECT public._my_perm_scope('integrations')) IS NOT NULL);
DROP POLICY IF EXISTS investors_select_owner ON public.investors;
DROP POLICY IF EXISTS investors_select_by_perm ON public.investors;
CREATE POLICY investors_select_by_perm ON public.investors FOR SELECT TO authenticated
  USING ((SELECT public._my_perm_scope('investors')) IS NOT NULL);
DROP POLICY IF EXISTS investor_payouts_select_owner ON public.investor_payouts;
DROP POLICY IF EXISTS investor_payouts_select_by_perm ON public.investor_payouts;
CREATE POLICY investor_payouts_select_by_perm ON public.investor_payouts FOR SELECT TO authenticated
  USING ((SELECT public._my_perm_scope('investors')) IS NOT NULL);

-- ══ B. PER-EMPLOYEE новые (schedules, notifications, employees, tasks) ═══════════
DROP POLICY IF EXISTS schedules_select_dept_head_perm ON public.schedules;
DROP POLICY IF EXISTS schedules_select_employee_perm  ON public.schedules;
DROP POLICY IF EXISTS schedules_select_owner          ON public.schedules;
DROP POLICY IF EXISTS schedules_select_self           ON public.schedules;
DROP POLICY IF EXISTS schedules_select_by_perm ON public.schedules;
CREATE POLICY schedules_select_by_perm ON public.schedules FOR SELECT TO authenticated
USING (
     (SELECT public._my_perm_scope('calendar')) = 'all'
  OR ((SELECT public._my_perm_scope('calendar')) = 'team' AND employee_id IN (SELECT public._my_dept_employee_ids()))
  OR ((SELECT public._my_perm_scope('calendar')) = 'own'  AND employee_id = (SELECT public.get_my_employee_id()))
);

DROP POLICY IF EXISTS notifications_select_employee_perm ON public.notifications;
DROP POLICY IF EXISTS notifications_select_owner         ON public.notifications;
DROP POLICY IF EXISTS notifications_select_self          ON public.notifications;
DROP POLICY IF EXISTS notifications_select_by_perm ON public.notifications;
CREATE POLICY notifications_select_by_perm ON public.notifications FOR SELECT TO authenticated
USING (
     (SELECT public._my_perm_scope('notifications')) = 'all'
  OR ((SELECT public._my_perm_scope('notifications')) = 'team' AND employee_id IN (SELECT public._my_dept_employee_ids()))
  OR ((SELECT public._my_perm_scope('notifications')) = 'own'  AND employee_id = (SELECT public.get_my_employee_id()))
);

-- employees: team=свой отдел (прямое сравнение колонки, без подзапроса к employees).
DROP POLICY IF EXISTS employees_select_dept_head_perm   ON public.employees;
DROP POLICY IF EXISTS employees_select_employee_perm    ON public.employees;
DROP POLICY IF EXISTS employees_select_owner_accountant ON public.employees;
DROP POLICY IF EXISTS employees_select_rop              ON public.employees;
DROP POLICY IF EXISTS employees_select_self             ON public.employees;
DROP POLICY IF EXISTS employees_select_by_perm ON public.employees;
CREATE POLICY employees_select_by_perm ON public.employees FOR SELECT TO authenticated
USING (
  deleted_at IS NULL AND (
       (SELECT public._my_perm_scope('employees')) = 'all'
    OR ((SELECT public._my_perm_scope('employees')) = 'team' AND department_id = (SELECT public.get_my_department_id()))
    OR ((SELECT public._my_perm_scope('employees')) = 'own'  AND user_id = (SELECT auth.uid()))
  )
);

DROP POLICY IF EXISTS tasks_select_dept_head ON public.tasks;
DROP POLICY IF EXISTS tasks_select_own       ON public.tasks;
DROP POLICY IF EXISTS tasks_select_owner     ON public.tasks;
DROP POLICY IF EXISTS tasks_select_by_perm ON public.tasks;
CREATE POLICY tasks_select_by_perm ON public.tasks FOR SELECT TO authenticated
USING (
     (SELECT public._my_perm_scope('tasks')) = 'all'
  OR ((SELECT public._my_perm_scope('tasks')) = 'team' AND (
        assignee_id IN (SELECT public._my_dept_employee_ids())
     OR created_by  IN (SELECT public._my_dept_employee_ids())))
  OR ((SELECT public._my_perm_scope('tasks')) = 'own' AND (
        assignee_id = (SELECT public.get_my_employee_id()) OR created_by = (SELECT public.get_my_employee_id())))
);

-- ══ C. ПЕРЕ-СОЗДАНИЕ политик 058 c обёрткой + team через SECDEF (perf + NOTE #11) ══
DROP POLICY IF EXISTS consultations_select_by_perm ON public.consultations;
DROP POLICY IF EXISTS consultations_select_by_perm ON public.consultations;
CREATE POLICY consultations_select_by_perm ON public.consultations FOR SELECT TO authenticated
USING (
  deleted_at IS NULL AND (
       (SELECT public._my_perm_scope('consultations')) = 'all'
    OR ((SELECT public._my_perm_scope('consultations')) = 'team' AND manager_id IN (SELECT public._my_dept_employee_ids()))
    OR ((SELECT public._my_perm_scope('consultations')) = 'own'  AND manager_id = (SELECT public.get_my_employee_id()))
  )
);

DROP POLICY IF EXISTS daily_activity_select_by_perm ON public.daily_activity;
DROP POLICY IF EXISTS daily_activity_select_by_perm ON public.daily_activity;
CREATE POLICY daily_activity_select_by_perm ON public.daily_activity FOR SELECT TO authenticated
USING (
     (SELECT public._my_perm_scope('decomposition')) = 'all'
  OR ((SELECT public._my_perm_scope('decomposition')) = 'team' AND employee_id IN (SELECT public._my_dept_employee_ids()))
  OR ((SELECT public._my_perm_scope('decomposition')) = 'own'  AND employee_id = (SELECT public.get_my_employee_id()))
);
DROP POLICY IF EXISTS sales_plan_weekly_select_by_perm ON public.sales_plan_weekly;
DROP POLICY IF EXISTS sales_plan_weekly_select_by_perm ON public.sales_plan_weekly;
CREATE POLICY sales_plan_weekly_select_by_perm ON public.sales_plan_weekly FOR SELECT TO authenticated
USING (
     (SELECT public._my_perm_scope('decomposition')) = 'all'
  OR ((SELECT public._my_perm_scope('decomposition')) = 'team' AND employee_id IN (SELECT public._my_dept_employee_ids()))
  OR ((SELECT public._my_perm_scope('decomposition')) = 'own'  AND employee_id = (SELECT public.get_my_employee_id()))
);

DROP POLICY IF EXISTS marketing_daily_data_select_by_perm ON public.marketing_daily_data;
DROP POLICY IF EXISTS marketing_daily_data_select_by_perm ON public.marketing_daily_data;
CREATE POLICY marketing_daily_data_select_by_perm ON public.marketing_daily_data FOR SELECT TO authenticated
USING (
     (SELECT public._my_perm_scope('marketing')) = 'all'
  OR ((SELECT public._my_perm_scope('marketing')) = 'team' AND employee_id IN (SELECT public._my_dept_employee_ids()))
  OR ((SELECT public._my_perm_scope('marketing')) = 'own'  AND employee_id = (SELECT public.get_my_employee_id()))
);

DROP POLICY IF EXISTS attendance_select_by_perm ON public.attendance;
DROP POLICY IF EXISTS attendance_select_by_perm ON public.attendance;
CREATE POLICY attendance_select_by_perm ON public.attendance FOR SELECT TO authenticated
USING (
     (SELECT public._my_perm_scope('attendance')) = 'all'
  OR ((SELECT public._my_perm_scope('attendance')) = 'team' AND employee_id IN (SELECT public._my_dept_employee_ids()))
  OR ((SELECT public._my_perm_scope('attendance')) = 'own'  AND employee_id = (SELECT public.get_my_employee_id()))
);

DROP POLICY IF EXISTS documents_select_by_perm ON public.documents;
DROP POLICY IF EXISTS documents_select_by_perm ON public.documents;
CREATE POLICY documents_select_by_perm ON public.documents FOR SELECT TO authenticated
USING (
  deleted_at IS NULL AND (
       (SELECT public._my_perm_scope('documents')) = 'all'
    OR ((SELECT public._my_perm_scope('documents')) = 'team' AND uploaded_by IN (SELECT public._my_dept_employee_ids()))
    OR ((SELECT public._my_perm_scope('documents')) = 'own'  AND uploaded_by = (SELECT public.get_my_employee_id()))
  )
);
DROP POLICY IF EXISTS documents_objects_select_by_perm ON storage.objects;
DROP POLICY IF EXISTS documents_objects_select_by_perm ON storage.objects;
CREATE POLICY documents_objects_select_by_perm ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'documents' AND (
       (SELECT public._my_perm_scope('documents')) = 'all'
    OR ((SELECT public._my_perm_scope('documents')) = 'team' AND (SELECT public._document_uploader(objects.name)) IN (SELECT public._my_dept_employee_ids()))
    OR ((SELECT public._my_perm_scope('documents')) = 'own'  AND (SELECT public._document_uploader(objects.name)) = (SELECT public.get_my_employee_id()))
  )
);

DROP POLICY IF EXISTS salaries_select_by_perm ON public.salaries;
DROP POLICY IF EXISTS salaries_select_by_perm ON public.salaries;
CREATE POLICY salaries_select_by_perm ON public.salaries FOR SELECT TO authenticated
USING (
     (SELECT public._my_perm_scope('salaries')) = 'all'
  OR ((SELECT public._my_perm_scope('salaries')) = 'team' AND employee_id IN (SELECT public._my_dept_employee_ids()))
  OR ((SELECT public._my_perm_scope('salaries')) = 'own'  AND employee_id = (SELECT public.get_my_employee_id()))
);
DROP POLICY IF EXISTS advance_payments_select_by_perm ON public.advance_payments;
DROP POLICY IF EXISTS advance_payments_select_by_perm ON public.advance_payments;
CREATE POLICY advance_payments_select_by_perm ON public.advance_payments FOR SELECT TO authenticated
USING (
     (SELECT public._my_perm_scope('salaries')) = 'all'
  OR ((SELECT public._my_perm_scope('salaries')) = 'team' AND employee_id IN (SELECT public._my_dept_employee_ids()))
  OR ((SELECT public._my_perm_scope('salaries')) = 'own'  AND employee_id = (SELECT public.get_my_employee_id()))
);
DROP POLICY IF EXISTS employee_kpi_select_by_perm ON public.employee_kpi;
DROP POLICY IF EXISTS employee_kpi_select_by_perm ON public.employee_kpi;
CREATE POLICY employee_kpi_select_by_perm ON public.employee_kpi FOR SELECT TO authenticated
USING (
     (SELECT public._my_perm_scope('salaries')) = 'all'
  OR ((SELECT public._my_perm_scope('salaries')) = 'team' AND employee_id IN (SELECT public._my_dept_employee_ids()))
  OR ((SELECT public._my_perm_scope('salaries')) = 'own'  AND employee_id = (SELECT public.get_my_employee_id()))
);
DROP POLICY IF EXISTS employee_kpi_results_select_by_perm ON public.employee_kpi_results;
DROP POLICY IF EXISTS employee_kpi_results_select_by_perm ON public.employee_kpi_results;
CREATE POLICY employee_kpi_results_select_by_perm ON public.employee_kpi_results FOR SELECT TO authenticated
USING (
     (SELECT public._my_perm_scope('salaries')) = 'all'
  OR ((SELECT public._my_perm_scope('salaries')) = 'team' AND employee_id IN (SELECT public._my_dept_employee_ids()))
  OR ((SELECT public._my_perm_scope('salaries')) = 'own'  AND employee_id = (SELECT public.get_my_employee_id()))
);
DROP POLICY IF EXISTS employee_kpi_item_results_select_by_perm ON public.employee_kpi_item_results;
DROP POLICY IF EXISTS employee_kpi_item_results_select_by_perm ON public.employee_kpi_item_results;
CREATE POLICY employee_kpi_item_results_select_by_perm ON public.employee_kpi_item_results FOR SELECT TO authenticated
USING (
     (SELECT public._my_perm_scope('salaries')) = 'all'
  OR ((SELECT public._my_perm_scope('salaries')) = 'team' AND employee_id IN (SELECT public._my_dept_employee_ids()))
  OR ((SELECT public._my_perm_scope('salaries')) = 'own'  AND employee_id = (SELECT public.get_my_employee_id()))
);
DROP POLICY IF EXISTS salary_calculations_select_by_perm ON public.salary_calculations;
DROP POLICY IF EXISTS salary_calculations_select_by_perm ON public.salary_calculations;
CREATE POLICY salary_calculations_select_by_perm ON public.salary_calculations FOR SELECT TO authenticated
USING (
     (SELECT public._my_perm_scope('salaries')) = 'all'
  OR ((SELECT public._my_perm_scope('salaries')) = 'team' AND (SELECT public._salary_employee(salary_id)) IN (SELECT public._my_dept_employee_ids()))
  OR ((SELECT public._my_perm_scope('salaries')) = 'own'  AND (SELECT public._salary_employee(salary_id)) = (SELECT public.get_my_employee_id()))
);

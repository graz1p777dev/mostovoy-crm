-- ─── 055: RLS-изоляция по отделу для фактов/декомпозиции (закрытие BOLA через Data API) ─
--
-- Блокер [P1]: клиент публикует URL + anon key, значит вошедший пользователь может дёрнуть
-- REST/Data API своим JWT В ОБХОД Server Actions. У authenticated есть SELECT на таблицах
-- фактов, а RLS содержала ШИРОКИЕ политики, дающие роли rop / permission_level=department_head
-- доступ к ЛЮБОЙ строке компании — без фильтра по отделу. Permissive-политики объединяются
-- через OR, поэтому узкая team-политика рядом с широкой не спасала.
--
-- Модель доступа (fail-closed): owner → все; department_head/rop → только сотрудники своего
-- отдела; сотрудник → только своя строка. Запись напрямую невозможна (у authenticated нет
-- INSERT/UPDATE-привилегий; все мутации идут через service_role из Server Actions/RPC).
--
-- Хелперы (get_my_role/permission_level/department_id/employee_id) — SECURITY DEFINER,
-- вызываем схемо-квалифицированно (public.*), чтобы поведение не зависело от search_path сессии.

-- ══ ЧАСТЬ 1. daily_activity — полный сброс политик, только 3-уровневый SELECT ══════
-- Прямой записи authenticated не имеет (grant=SELECT); DML-политики (в т.ч. широкая
-- owner_rop) удаляются как defense-in-depth — запись только через service_role.
DROP POLICY IF EXISTS daily_facts_select_owner_rop      ON public.daily_activity;  -- ← широкая (008): rop видел всё
DROP POLICY IF EXISTS daily_facts_select_dept_head_perm ON public.daily_activity;
DROP POLICY IF EXISTS daily_facts_select_employee_perm  ON public.daily_activity;
DROP POLICY IF EXISTS daily_facts_select_self           ON public.daily_activity;
DROP POLICY IF EXISTS daily_facts_insert_owner_rop      ON public.daily_activity;  -- ← широкая DML (008)
DROP POLICY IF EXISTS daily_facts_insert_employee_perm  ON public.daily_activity;
DROP POLICY IF EXISTS daily_facts_insert_self           ON public.daily_activity;
DROP POLICY IF EXISTS daily_facts_update_owner_rop      ON public.daily_activity;  -- ← широкая DML (008)
DROP POLICY IF EXISTS daily_facts_update_employee_perm  ON public.daily_activity;
DROP POLICY IF EXISTS daily_facts_update_self           ON public.daily_activity;
DROP POLICY IF EXISTS daily_facts_delete_owner          ON public.daily_activity;

CREATE POLICY daily_activity_select_owner ON public.daily_activity FOR SELECT TO authenticated
  USING (public.get_my_role() = 'owner');
CREATE POLICY daily_activity_select_dept_head ON public.daily_activity FOR SELECT TO authenticated
  USING (
    public.get_my_permission_level() = 'department_head'
    AND employee_id IN (
      SELECT e.id FROM public.employees e
      WHERE e.department_id = public.get_my_department_id() AND e.deleted_at IS NULL
    )
  );
CREATE POLICY daily_activity_select_self ON public.daily_activity FOR SELECT TO authenticated
  USING (employee_id = public.get_my_employee_id());

-- ══ ЧАСТЬ 2. marketing_daily_data — то же (широкая была на department_head без отдела) ══
DROP POLICY IF EXISTS marketing_daily_select ON public.marketing_daily_data;  -- ← широкая (043): dept_head видел всё
DROP POLICY IF EXISTS marketing_daily_insert ON public.marketing_daily_data;  -- ← широкая DML
DROP POLICY IF EXISTS marketing_daily_update ON public.marketing_daily_data;  -- ← широкая DML

CREATE POLICY marketing_daily_data_select_owner ON public.marketing_daily_data FOR SELECT TO authenticated
  USING (public.get_my_role() = 'owner');
CREATE POLICY marketing_daily_data_select_dept_head ON public.marketing_daily_data FOR SELECT TO authenticated
  USING (
    public.get_my_permission_level() = 'department_head'
    AND employee_id IN (
      SELECT e.id FROM public.employees e
      WHERE e.department_id = public.get_my_department_id() AND e.deleted_at IS NULL
    )
  );
CREATE POLICY marketing_daily_data_select_self ON public.marketing_daily_data FOR SELECT TO authenticated
  USING (employee_id = public.get_my_employee_id());

-- ══ ЧАСТЬ 3. Та же болезнь на других таблицах с employee_id ════════════════════════
-- Свип показал широкие SELECT-политики `role IN ('owner','rop'[,'accountant'])` (rop видит
-- всю компанию) на: attendance, employee_kpi, sales_plan_weekly, schedules. У всех уже есть
-- корректная team-политика `*_select_dept_head_perm` — поэтому достаточно УБРАТЬ rop из
-- широкой (owner и, где был, accountant — сохраняем: это роли со scope=all по дизайну;
-- accountant нужен факт/посещаемость всей компании для зарплат). rop → свой отдел через
-- существующую dept_head-политику.
--   employee_kpi_results НЕ трогаем — там team-политика уже отдел-скоупная (эталон).
--   Прямой записи на эти таблицы у authenticated нет (grant=SELECT), их широкие DML-политики
--   недостижимы через Data API — здесь не трогаем (вне периметра блокера READ).

DROP POLICY IF EXISTS attendance_select_owner_rop_accountant ON public.attendance;
CREATE POLICY attendance_select_owner_accountant ON public.attendance FOR SELECT TO authenticated
  USING (public.get_my_role() = ANY (ARRAY['owner','accountant']));

DROP POLICY IF EXISTS employee_kpi_select_owner_rop ON public.employee_kpi;
CREATE POLICY employee_kpi_select_owner_accountant ON public.employee_kpi FOR SELECT TO authenticated
  USING (public.get_my_role() = ANY (ARRAY['owner','accountant']));

DROP POLICY IF EXISTS decomposition_select_owner_rop ON public.sales_plan_weekly;
CREATE POLICY sales_plan_weekly_select_owner ON public.sales_plan_weekly FOR SELECT TO authenticated
  USING (public.get_my_role() = 'owner');

DROP POLICY IF EXISTS schedules_select_owner_rop ON public.schedules;
CREATE POLICY schedules_select_owner ON public.schedules FOR SELECT TO authenticated
  USING (public.get_my_role() = 'owner');

-- ══ ЧАСТЬ 4. NOTE security advisor: _fact_scope_ok без фиксированного search_path ═════
-- Тело — чистое выражение (операторы pg_catalog), таблиц не читает; пустой search_path
-- безопасен и снимает предупреждение о mutable search_path.
CREATE OR REPLACE FUNCTION public._fact_scope_ok(
  p_target_emp  uuid,
  p_target_dept uuid,
  p_actor_emp   uuid,
  p_scope       text,
  p_actor_dept  uuid
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT COALESCE(
       p_scope = 'all'
    OR (p_scope = 'own'  AND p_target_emp = p_actor_emp)
    OR (p_scope = 'team' AND (
           p_target_emp = p_actor_emp
        OR (p_target_dept IS NOT NULL AND p_target_dept = p_actor_dept)
       )),
    false
  );
$$;
REVOKE ALL ON FUNCTION public._fact_scope_ok(uuid, uuid, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._fact_scope_ok(uuid, uuid, uuid, text, uuid) TO service_role;

-- ============================================================
-- Migration 025: Custom Roles
-- Добавляет поддержку пользовательских ролей:
-- permission_level, soft delete, get_my_permission_level(),
-- и аддитивные RLS-политики для новых ролей.
--
-- Существующие политики (system roles) НЕ ТРОНУТЫ.
-- Новые политики работают через permission_level — все роли
-- с одинаковым уровнем доступа получают одинаковые права
-- автоматически, без изменения политик под каждую роль.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Добавляем колонки в таблицу roles
-- ------------------------------------------------------------

ALTER TABLE public.roles
  ADD COLUMN IF NOT EXISTS permission_level VARCHAR(20) NOT NULL DEFAULT 'employee'
    CONSTRAINT roles_permission_level_check CHECK (
      permission_level IN ('owner', 'department_head', 'employee', 'accountant')
    ),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Заполняем permission_level для системных ролей
UPDATE public.roles SET permission_level = 'owner'          WHERE name = 'owner';
UPDATE public.roles SET permission_level = 'department_head' WHERE name = 'rop';
UPDATE public.roles SET permission_level = 'employee'        WHERE name IN ('mp', 'lmai');
UPDATE public.roles SET permission_level = 'accountant'      WHERE name = 'accountant';

-- Снимаем ограничение на имя роли — разрешаем произвольные имена
ALTER TABLE public.roles DROP CONSTRAINT IF EXISTS roles_name_check;

-- ------------------------------------------------------------
-- 2. Снимаем ограничение на поле role в таблице employees
--    (разрешаем хранить пользовательские роли)
-- ------------------------------------------------------------

ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_role_check;

-- ------------------------------------------------------------
-- 3. Функция get_my_permission_level()
--    Возвращает уровень доступа текущего пользователя,
--    определяя его через JOIN на таблицу roles.
--    Для неизвестных/удалённых ролей возвращает 'employee' (наименьший доступ).
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_permission_level()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (
      SELECT r.permission_level
      FROM public.employees e
      JOIN public.roles r ON r.name = e.role AND r.deleted_at IS NULL
      WHERE e.user_id = auth.uid()
      LIMIT 1
    ),
    'employee'
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_my_permission_level() TO authenticated;

-- ============================================================
-- 4. Аддитивные RLS-политики через permission_level
--
-- Логика: система ролей теперь двухуровневая:
--   get_my_role()             — для системных ролей (старые политики)
--   get_my_permission_level() — для всех ролей (новые политики)
--
-- Система прав:
--   'owner'          → полный доступ ко всем данным
--   'department_head'→ данные своего отдела + свои
--   'employee'       → только свои данные
--   'accountant'     → только финансы и зарплаты
-- ============================================================

-- ─── consultations ────────────────────────────────────────────────────────────

-- department_head видит консультации своего отдела
CREATE POLICY "consultations_select_dept_head_perm"
  ON public.consultations FOR SELECT
  TO authenticated
  USING (
    public.get_my_permission_level() = 'department_head'
    AND deleted_at IS NULL
    AND manager_id IN (
      SELECT id FROM public.employees
      WHERE department_id = public.get_my_department_id()
        AND deleted_at IS NULL
    )
  );

-- employee видит только свои консультации
CREATE POLICY "consultations_select_employee_perm"
  ON public.consultations FOR SELECT
  TO authenticated
  USING (
    public.get_my_permission_level() = 'employee'
    AND manager_id = public.get_my_employee_id()
    AND deleted_at IS NULL
  );

-- employee и department_head могут создавать консультации
CREATE POLICY "consultations_insert_perm"
  ON public.consultations FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_my_permission_level() IN ('employee', 'department_head')
  );

-- employee может редактировать свои
CREATE POLICY "consultations_update_employee_perm"
  ON public.consultations FOR UPDATE
  TO authenticated
  USING (
    public.get_my_permission_level() = 'employee'
    AND manager_id = public.get_my_employee_id()
    AND deleted_at IS NULL
  );

-- department_head может редактировать в своём отделе
CREATE POLICY "consultations_update_dept_head_perm"
  ON public.consultations FOR UPDATE
  TO authenticated
  USING (
    public.get_my_permission_level() = 'department_head'
    AND deleted_at IS NULL
    AND manager_id IN (
      SELECT id FROM public.employees
      WHERE department_id = public.get_my_department_id()
        AND deleted_at IS NULL
    )
  );

-- employee может soft-delete своих
CREATE POLICY "consultations_delete_employee_perm"
  ON public.consultations FOR DELETE
  TO authenticated
  USING (
    public.get_my_permission_level() = 'employee'
    AND manager_id = public.get_my_employee_id()
  );

-- department_head может soft-delete в своём отделе
CREATE POLICY "consultations_delete_dept_head_perm"
  ON public.consultations FOR DELETE
  TO authenticated
  USING (
    public.get_my_permission_level() = 'department_head'
    AND manager_id IN (
      SELECT id FROM public.employees
      WHERE department_id = public.get_my_department_id()
        AND deleted_at IS NULL
    )
  );

-- consultation_results — аналогично consultations

CREATE POLICY "cons_results_select_dept_head_perm"
  ON public.consultation_results FOR SELECT
  TO authenticated
  USING (
    public.get_my_permission_level() = 'department_head'
    AND EXISTS (
      SELECT 1 FROM public.consultations c
      WHERE c.id = consultation_results.consultation_id
        AND c.manager_id IN (
          SELECT id FROM public.employees
          WHERE department_id = public.get_my_department_id()
            AND deleted_at IS NULL
        )
    )
  );

CREATE POLICY "cons_results_select_employee_perm"
  ON public.consultation_results FOR SELECT
  TO authenticated
  USING (
    public.get_my_permission_level() = 'employee'
    AND EXISTS (
      SELECT 1 FROM public.consultations c
      WHERE c.id = consultation_results.consultation_id
        AND c.manager_id = public.get_my_employee_id()
    )
  );

CREATE POLICY "cons_results_insert_perm"
  ON public.consultation_results FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_my_permission_level() IN ('employee', 'department_head')
    AND EXISTS (
      SELECT 1 FROM public.consultations c
      WHERE c.id = consultation_results.consultation_id
        AND (
          c.manager_id = public.get_my_employee_id()
          OR (
            public.get_my_permission_level() = 'department_head'
            AND c.manager_id IN (
              SELECT id FROM public.employees
              WHERE department_id = public.get_my_department_id()
                AND deleted_at IS NULL
            )
          )
        )
    )
  );

CREATE POLICY "cons_results_update_employee_perm"
  ON public.consultation_results FOR UPDATE
  TO authenticated
  USING (
    public.get_my_permission_level() = 'employee'
    AND EXISTS (
      SELECT 1 FROM public.consultations c
      WHERE c.id = consultation_results.consultation_id
        AND c.manager_id = public.get_my_employee_id()
    )
  );

-- ─── employees ────────────────────────────────────────────────────────────────

-- employee видит только свою запись
CREATE POLICY "employees_select_employee_perm"
  ON public.employees FOR SELECT
  TO authenticated
  USING (
    public.get_my_permission_level() = 'employee'
    AND user_id = auth.uid()
    AND deleted_at IS NULL
  );

-- department_head видит свой отдел
CREATE POLICY "employees_select_dept_head_perm"
  ON public.employees FOR SELECT
  TO authenticated
  USING (
    public.get_my_permission_level() = 'department_head'
    AND department_id = public.get_my_department_id()
    AND deleted_at IS NULL
  );

-- employee может обновлять ограниченные поля своей записи
CREATE POLICY "employees_update_employee_perm"
  ON public.employees FOR UPDATE
  TO authenticated
  USING (
    public.get_my_permission_level() = 'employee'
    AND user_id = auth.uid()
  );

-- ─── attendance ───────────────────────────────────────────────────────────────

CREATE POLICY "attendance_select_employee_perm"
  ON public.attendance FOR SELECT
  TO authenticated
  USING (
    public.get_my_permission_level() = 'employee'
    AND employee_id = public.get_my_employee_id()
  );

CREATE POLICY "attendance_select_dept_head_perm"
  ON public.attendance FOR SELECT
  TO authenticated
  USING (
    public.get_my_permission_level() = 'department_head'
    AND employee_id IN (
      SELECT id FROM public.employees
      WHERE department_id = public.get_my_department_id()
        AND deleted_at IS NULL
    )
  );

-- ─── schedules ────────────────────────────────────────────────────────────────

CREATE POLICY "schedules_select_employee_perm"
  ON public.schedules FOR SELECT
  TO authenticated
  USING (
    public.get_my_permission_level() = 'employee'
    AND employee_id = public.get_my_employee_id()
  );

CREATE POLICY "schedules_select_dept_head_perm"
  ON public.schedules FOR SELECT
  TO authenticated
  USING (
    public.get_my_permission_level() = 'department_head'
    AND employee_id IN (
      SELECT id FROM public.employees
      WHERE department_id = public.get_my_department_id()
        AND deleted_at IS NULL
    )
  );

-- ─── daily_facts ──────────────────────────────────────────────────────────────

CREATE POLICY "daily_facts_select_employee_perm"
  ON public.daily_facts FOR SELECT
  TO authenticated
  USING (
    public.get_my_permission_level() = 'employee'
    AND employee_id = public.get_my_employee_id()
  );

CREATE POLICY "daily_facts_insert_employee_perm"
  ON public.daily_facts FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_my_permission_level() = 'employee'
    AND employee_id = public.get_my_employee_id()
  );

CREATE POLICY "daily_facts_update_employee_perm"
  ON public.daily_facts FOR UPDATE
  TO authenticated
  USING (
    public.get_my_permission_level() = 'employee'
    AND employee_id = public.get_my_employee_id()
  );

CREATE POLICY "daily_facts_select_dept_head_perm"
  ON public.daily_facts FOR SELECT
  TO authenticated
  USING (
    public.get_my_permission_level() = 'department_head'
    AND employee_id IN (
      SELECT id FROM public.employees
      WHERE department_id = public.get_my_department_id()
        AND deleted_at IS NULL
    )
  );

-- ─── decomposition (позже переименована в sales_plan_weekly, см. 026a) ────────

CREATE POLICY "decomposition_select_employee_perm"
  ON public.decomposition FOR SELECT
  TO authenticated
  USING (
    public.get_my_permission_level() = 'employee'
    AND employee_id = public.get_my_employee_id()
  );

CREATE POLICY "decomposition_select_dept_head_perm"
  ON public.decomposition FOR SELECT
  TO authenticated
  USING (
    public.get_my_permission_level() = 'department_head'
    AND employee_id IN (
      SELECT id FROM public.employees
      WHERE department_id = public.get_my_department_id()
        AND deleted_at IS NULL
    )
  );

-- ─── employee_kpi ─────────────────────────────────────────────────────────────

CREATE POLICY "employee_kpi_select_employee_perm"
  ON public.employee_kpi FOR SELECT
  TO authenticated
  USING (
    public.get_my_permission_level() = 'employee'
    AND employee_id = public.get_my_employee_id()
  );

CREATE POLICY "employee_kpi_select_dept_head_perm"
  ON public.employee_kpi FOR SELECT
  TO authenticated
  USING (
    public.get_my_permission_level() = 'department_head'
    AND employee_id IN (
      SELECT id FROM public.employees
      WHERE department_id = public.get_my_department_id()
        AND deleted_at IS NULL
    )
  );

-- ─── kpi_templates ────────────────────────────────────────────────────────────

CREATE POLICY "kpi_templates_select_employee_perm"
  ON public.kpi_templates FOR SELECT
  TO authenticated
  USING (
    public.get_my_permission_level() IN ('employee', 'department_head')
  );

-- ─── notifications ────────────────────────────────────────────────────────────

CREATE POLICY "notifications_select_employee_perm"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (
    public.get_my_permission_level() IN ('employee', 'department_head')
    AND employee_id = public.get_my_employee_id()
  );

CREATE POLICY "notifications_update_employee_perm"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (
    public.get_my_permission_level() IN ('employee', 'department_head')
    AND employee_id = public.get_my_employee_id()
  );

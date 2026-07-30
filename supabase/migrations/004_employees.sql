-- ============================================================
-- Migration 004: employees
-- Центральная таблица системы.
-- Связывает Supabase Auth (auth.users) с бизнес-данными.
-- ============================================================

CREATE TABLE public.employees (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID          UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  department_id    UUID          REFERENCES public.departments(id) ON DELETE SET NULL,
  name             VARCHAR(255)  NOT NULL,
  phone            VARCHAR(20),
  email            VARCHAR(255)  NOT NULL,
  role             TEXT          NOT NULL DEFAULT 'mp',
  avatar_url       TEXT,
  hire_date        DATE,
  birth_date       DATE,
  base_salary      NUMERIC(12,2) NOT NULL DEFAULT 0,
  kpi_coefficient  NUMERIC(5,2)  NOT NULL DEFAULT 1.0,
  schedule_type    TEXT          NOT NULL DEFAULT '5/2',
  work_start_time  TIME          DEFAULT '09:00',
  work_end_time    TIME          DEFAULT '18:00',
  status           TEXT          NOT NULL DEFAULT 'active',
  notes            TEXT,
  deleted_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT employees_email_unique UNIQUE (email),
  CONSTRAINT employees_role_check CHECK (
    role IN ('owner','rop','mp','lmai','accountant')
  ),
  CONSTRAINT employees_status_check CHECK (
    status IN ('active','probation','archived')
  ),
  CONSTRAINT employees_schedule_check CHECK (
    schedule_type IN ('5/2','2/2','1/1','3/3','weekends','custom')
  ),
  CONSTRAINT employees_base_salary_check CHECK (base_salary >= 0),
  CONSTRAINT employees_kpi_coefficient_check CHECK (kpi_coefficient >= 0)
);

-- Индексы
CREATE INDEX idx_employees_user_id  ON public.employees(user_id);
CREATE INDEX idx_employees_role     ON public.employees(role);
CREATE INDEX idx_employees_status   ON public.employees(status);
CREATE INDEX idx_employees_deleted  ON public.employees(deleted_at) WHERE deleted_at IS NULL;

-- Триггер updated_at
CREATE TRIGGER set_employees_updated_at
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Теперь добавляем FK departments.manager_id → employees.id
ALTER TABLE public.departments
  ADD CONSTRAINT departments_manager_id_fkey
  FOREIGN KEY (manager_id) REFERENCES public.employees(id) ON DELETE SET NULL;

-- RLS
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

-- SELECT
CREATE POLICY "employees_select_owner_accountant"
  ON public.employees FOR SELECT
  TO authenticated
  USING (
    public.get_my_role() IN ('owner','accountant')
    AND deleted_at IS NULL
  );

CREATE POLICY "employees_select_rop"
  ON public.employees FOR SELECT
  TO authenticated
  USING (
    public.get_my_role() = 'rop'
    AND deleted_at IS NULL
    AND (
      department_id = public.get_my_department_id()
      OR id = public.get_my_employee_id()
    )
  );

CREATE POLICY "employees_select_self"
  ON public.employees FOR SELECT
  TO authenticated
  USING (
    public.get_my_role() IN ('mp','lmai')
    AND user_id = auth.uid()
    AND deleted_at IS NULL
  );

-- INSERT
CREATE POLICY "employees_insert_owner"
  ON public.employees FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_role() = 'owner');

-- UPDATE
CREATE POLICY "employees_update_owner"
  ON public.employees FOR UPDATE
  TO authenticated
  USING (public.get_my_role() = 'owner');

CREATE POLICY "employees_update_self_limited"
  ON public.employees FOR UPDATE
  TO authenticated
  USING (
    public.get_my_role() IN ('mp','lmai')
    AND user_id = auth.uid()
  );

-- DELETE (только soft delete через deleted_at)
CREATE POLICY "employees_delete_owner"
  ON public.employees FOR DELETE
  TO authenticated
  USING (public.get_my_role() = 'owner');

-- ============================================================
-- Migration 005: schedules + attendance
-- Расписание сотрудников и учёт явок.
-- ============================================================

-- ------------------------------------------------------------
-- Таблица: schedules
-- ------------------------------------------------------------
CREATE TABLE public.schedules (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID        NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  date        DATE        NOT NULL,
  is_workday  BOOLEAN     NOT NULL DEFAULT true,
  work_start  TIME,
  work_end    TIME,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT schedules_emp_date_unique UNIQUE (employee_id, date)
);

-- Индексы
CREATE INDEX idx_schedules_employee_id ON public.schedules(employee_id);
CREATE INDEX idx_schedules_date        ON public.schedules(date);
CREATE INDEX idx_schedules_emp_date    ON public.schedules(employee_id, date);

-- Триггер updated_at
CREATE TRIGGER set_schedules_updated_at
  BEFORE UPDATE ON public.schedules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "schedules_select_owner_rop"
  ON public.schedules FOR SELECT
  TO authenticated
  USING (public.get_my_role() IN ('owner','rop'));

CREATE POLICY "schedules_select_self"
  ON public.schedules FOR SELECT
  TO authenticated
  USING (
    public.get_my_role() IN ('mp','lmai')
    AND employee_id = public.get_my_employee_id()
  );

CREATE POLICY "schedules_insert_owner_rop"
  ON public.schedules FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_role() IN ('owner','rop'));

CREATE POLICY "schedules_update_owner_rop"
  ON public.schedules FOR UPDATE
  TO authenticated
  USING (public.get_my_role() IN ('owner','rop'));

CREATE POLICY "schedules_delete_owner_rop"
  ON public.schedules FOR DELETE
  TO authenticated
  USING (public.get_my_role() IN ('owner','rop'));

-- ------------------------------------------------------------
-- Таблица: attendance
-- ------------------------------------------------------------
CREATE TABLE public.attendance (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID        NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  date        DATE        NOT NULL,
  status      TEXT        NOT NULL,
  comment     TEXT,
  marked_by   UUID        REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT attendance_emp_date_unique UNIQUE (employee_id, date),
  CONSTRAINT attendance_status_check CHECK (
    status IN ('worked','sick','day_off','vacation','absent','remote')
  )
);

-- Индексы
CREATE INDEX idx_attendance_employee_id ON public.attendance(employee_id);
CREATE INDEX idx_attendance_date        ON public.attendance(date);
CREATE INDEX idx_attendance_emp_date    ON public.attendance(employee_id, date);
CREATE INDEX idx_attendance_status      ON public.attendance(status);

-- Триггер updated_at
CREATE TRIGGER set_attendance_updated_at
  BEFORE UPDATE ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attendance_select_owner_rop_accountant"
  ON public.attendance FOR SELECT
  TO authenticated
  USING (public.get_my_role() IN ('owner','rop','accountant'));

CREATE POLICY "attendance_select_self"
  ON public.attendance FOR SELECT
  TO authenticated
  USING (
    public.get_my_role() IN ('mp','lmai')
    AND employee_id = public.get_my_employee_id()
  );

CREATE POLICY "attendance_insert_owner_rop"
  ON public.attendance FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_role() IN ('owner','rop'));

CREATE POLICY "attendance_update_owner_rop"
  ON public.attendance FOR UPDATE
  TO authenticated
  USING (public.get_my_role() IN ('owner','rop'));

CREATE POLICY "attendance_delete_owner"
  ON public.attendance FOR DELETE
  TO authenticated
  USING (public.get_my_role() = 'owner');

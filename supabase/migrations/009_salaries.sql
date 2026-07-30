-- ============================================================
-- Migration 009: salaries + salary_calculations
-- Зарплаты и детальный лог расчёта.
-- ============================================================

-- ------------------------------------------------------------
-- Таблица: salaries
-- ------------------------------------------------------------
CREATE TABLE public.salaries (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     UUID          NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  period_year     SMALLINT      NOT NULL,
  period_month    SMALLINT      NOT NULL,
  base_salary     NUMERIC(12,2) NOT NULL DEFAULT 0,
  kpi_bonus       NUMERIC(12,2) NOT NULL DEFAULT 0,
  bonuses         NUMERIC(12,2) NOT NULL DEFAULT 0,
  deductions      NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
  kpi_pct         NUMERIC(5,2)  NOT NULL DEFAULT 0,
  work_days_fact  SMALLINT      NOT NULL DEFAULT 0,
  work_days_plan  SMALLINT      NOT NULL DEFAULT 0,
  status          TEXT          NOT NULL DEFAULT 'draft',
  paid_at         TIMESTAMPTZ,
  paid_by         UUID          REFERENCES public.employees(id) ON DELETE SET NULL,
  notes           TEXT,
  calculated_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT salaries_emp_period_unique UNIQUE (employee_id, period_year, period_month),
  CONSTRAINT salaries_status_check  CHECK (status IN ('draft','calculated','paid')),
  CONSTRAINT salaries_month_check   CHECK (period_month BETWEEN 1 AND 12),
  CONSTRAINT salaries_amount_check  CHECK (total_amount >= 0)
);

-- Индексы
CREATE INDEX idx_salaries_emp_id  ON public.salaries(employee_id);
CREATE INDEX idx_salaries_period  ON public.salaries(period_year, period_month);
CREATE INDEX idx_salaries_status  ON public.salaries(status);

-- Триггер updated_at
CREATE TRIGGER set_salaries_updated_at
  BEFORE UPDATE ON public.salaries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.salaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "salaries_select_owner_accountant"
  ON public.salaries FOR SELECT
  TO authenticated
  USING (public.get_my_role() IN ('owner','accountant'));

CREATE POLICY "salaries_select_rop"
  ON public.salaries FOR SELECT
  TO authenticated
  USING (
    public.get_my_role() = 'rop'
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = salaries.employee_id
        AND e.department_id = public.get_my_department_id()
    )
  );

CREATE POLICY "salaries_select_self"
  ON public.salaries FOR SELECT
  TO authenticated
  USING (
    public.get_my_role() IN ('mp','lmai')
    AND employee_id = public.get_my_employee_id()
  );

CREATE POLICY "salaries_insert_owner_accountant"
  ON public.salaries FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_role() IN ('owner','accountant'));

CREATE POLICY "salaries_update_owner_accountant"
  ON public.salaries FOR UPDATE
  TO authenticated
  USING (public.get_my_role() IN ('owner','accountant'));

CREATE POLICY "salaries_delete_owner"
  ON public.salaries FOR DELETE
  TO authenticated
  USING (public.get_my_role() = 'owner');

-- ------------------------------------------------------------
-- Таблица: salary_calculations
-- ------------------------------------------------------------
CREATE TABLE public.salary_calculations (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  salary_id    UUID          NOT NULL REFERENCES public.salaries(id) ON DELETE CASCADE,
  type         TEXT          NOT NULL,
  description  VARCHAR(255)  NOT NULL,
  amount       NUMERIC(12,2) NOT NULL,
  metric_name  VARCHAR(100),
  metric_plan  NUMERIC(10,2),
  metric_fact  NUMERIC(10,2),
  metric_pct   NUMERIC(5,2),
  weight       NUMERIC(5,2),
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT salary_calc_type_check CHECK (
    type IN ('base_salary','kpi_bonus','manual_bonus','deduction','day_adjustment')
  )
);

-- Индексы
CREATE INDEX idx_salary_calc_salary_id ON public.salary_calculations(salary_id);

-- RLS
ALTER TABLE public.salary_calculations ENABLE ROW LEVEL SECURITY;

-- Следует политике salaries: доступ через salary_id
CREATE POLICY "salary_calc_select_owner_accountant"
  ON public.salary_calculations FOR SELECT
  TO authenticated
  USING (
    public.get_my_role() IN ('owner','accountant')
  );

CREATE POLICY "salary_calc_select_rop"
  ON public.salary_calculations FOR SELECT
  TO authenticated
  USING (
    public.get_my_role() = 'rop'
    AND EXISTS (
      SELECT 1 FROM public.salaries s
      JOIN public.employees e ON e.id = s.employee_id
      WHERE s.id = salary_calculations.salary_id
        AND e.department_id = public.get_my_department_id()
    )
  );

CREATE POLICY "salary_calc_select_self"
  ON public.salary_calculations FOR SELECT
  TO authenticated
  USING (
    public.get_my_role() IN ('mp','lmai')
    AND EXISTS (
      SELECT 1 FROM public.salaries s
      WHERE s.id = salary_calculations.salary_id
        AND s.employee_id = public.get_my_employee_id()
    )
  );

CREATE POLICY "salary_calc_insert_owner_accountant"
  ON public.salary_calculations FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_role() IN ('owner','accountant'));

CREATE POLICY "salary_calc_update_owner_accountant"
  ON public.salary_calculations FOR UPDATE
  TO authenticated
  USING (public.get_my_role() IN ('owner','accountant'));

CREATE POLICY "salary_calc_delete_owner"
  ON public.salary_calculations FOR DELETE
  TO authenticated
  USING (public.get_my_role() = 'owner');

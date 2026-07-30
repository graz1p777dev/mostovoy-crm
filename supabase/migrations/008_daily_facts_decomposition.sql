-- ============================================================
-- Migration 008: daily_facts + decomposition
-- Ежедневные факты и агрегат план-факт по месяцу.
-- ============================================================

-- ------------------------------------------------------------
-- Таблица: daily_facts
-- ------------------------------------------------------------
CREATE TABLE public.daily_facts (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     UUID          NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  date            DATE          NOT NULL,
  fv_fact         INTEGER,
  sales_fact      INTEGER,
  revenue_fact    NUMERIC(12,2),
  nv_fact         INTEGER,
  nv_sales_fact   INTEGER,
  nv_revenue_fact NUMERIC(12,2),
  appeals_fact    INTEGER,
  leads_fact      INTEGER,
  notes           TEXT,
  created_by      UUID          REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT daily_facts_emp_date_unique UNIQUE (employee_id, date),
  CONSTRAINT daily_facts_fv_check      CHECK (fv_fact IS NULL OR fv_fact >= 0),
  CONSTRAINT daily_facts_sales_check   CHECK (sales_fact IS NULL OR sales_fact >= 0),
  CONSTRAINT daily_facts_revenue_check CHECK (revenue_fact IS NULL OR revenue_fact >= 0)
);

-- Индексы
CREATE INDEX idx_daily_facts_emp_id   ON public.daily_facts(employee_id);
CREATE INDEX idx_daily_facts_date     ON public.daily_facts(date);
CREATE INDEX idx_daily_facts_emp_date ON public.daily_facts(employee_id, date);

-- Триггер updated_at
CREATE TRIGGER set_daily_facts_updated_at
  BEFORE UPDATE ON public.daily_facts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.daily_facts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "daily_facts_select_owner_rop"
  ON public.daily_facts FOR SELECT
  TO authenticated
  USING (public.get_my_role() IN ('owner','rop'));

CREATE POLICY "daily_facts_select_self"
  ON public.daily_facts FOR SELECT
  TO authenticated
  USING (
    public.get_my_role() IN ('mp','lmai')
    AND employee_id = public.get_my_employee_id()
  );

CREATE POLICY "daily_facts_insert_owner_rop"
  ON public.daily_facts FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_role() IN ('owner','rop'));

CREATE POLICY "daily_facts_insert_self"
  ON public.daily_facts FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_my_role() IN ('mp','lmai')
    AND employee_id = public.get_my_employee_id()
  );

CREATE POLICY "daily_facts_update_owner_rop"
  ON public.daily_facts FOR UPDATE
  TO authenticated
  USING (public.get_my_role() IN ('owner','rop'));

CREATE POLICY "daily_facts_update_self"
  ON public.daily_facts FOR UPDATE
  TO authenticated
  USING (
    public.get_my_role() IN ('mp','lmai')
    AND employee_id = public.get_my_employee_id()
  );

CREATE POLICY "daily_facts_delete_owner"
  ON public.daily_facts FOR DELETE
  TO authenticated
  USING (public.get_my_role() = 'owner');

-- ------------------------------------------------------------
-- Таблица: decomposition
-- ------------------------------------------------------------
CREATE TABLE public.decomposition (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id           UUID          NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  period_year           SMALLINT      NOT NULL,
  period_month          SMALLINT      NOT NULL,
  total_fv_plan         INTEGER       NOT NULL DEFAULT 0,
  total_fv_fact         INTEGER       NOT NULL DEFAULT 0,
  total_sales_plan      INTEGER       NOT NULL DEFAULT 0,
  total_sales_fact      INTEGER       NOT NULL DEFAULT 0,
  total_revenue_plan    NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_revenue_fact    NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_work_days_plan  SMALLINT      NOT NULL DEFAULT 0,
  total_work_days_fact  SMALLINT      NOT NULL DEFAULT 0,
  kpi_pct               NUMERIC(5,2)  NOT NULL DEFAULT 0,
  last_calculated_at    TIMESTAMPTZ,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT decomposition_emp_period_unique UNIQUE (employee_id, period_year, period_month),
  CONSTRAINT decomposition_month_check CHECK (period_month BETWEEN 1 AND 12),
  CONSTRAINT decomposition_kpi_check   CHECK (kpi_pct >= 0)
);

-- Индексы
CREATE INDEX idx_decomposition_emp_id  ON public.decomposition(employee_id);
CREATE INDEX idx_decomposition_period  ON public.decomposition(period_year, period_month);
CREATE INDEX idx_decomposition_emp_per ON public.decomposition(employee_id, period_year, period_month);

-- Триггер updated_at
CREATE TRIGGER set_decomposition_updated_at
  BEFORE UPDATE ON public.decomposition
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.decomposition ENABLE ROW LEVEL SECURITY;

CREATE POLICY "decomposition_select_owner_rop"
  ON public.decomposition FOR SELECT
  TO authenticated
  USING (public.get_my_role() IN ('owner','rop'));

CREATE POLICY "decomposition_select_self"
  ON public.decomposition FOR SELECT
  TO authenticated
  USING (
    public.get_my_role() IN ('mp','lmai')
    AND employee_id = public.get_my_employee_id()
  );

-- INSERT/UPDATE через SECURITY DEFINER функцию (system)
CREATE POLICY "decomposition_insert_system"
  ON public.decomposition FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_role() IN ('owner','rop'));

CREATE POLICY "decomposition_update_system"
  ON public.decomposition FOR UPDATE
  TO authenticated
  USING (public.get_my_role() IN ('owner','rop'));

CREATE POLICY "decomposition_delete_owner"
  ON public.decomposition FOR DELETE
  TO authenticated
  USING (public.get_my_role() = 'owner');

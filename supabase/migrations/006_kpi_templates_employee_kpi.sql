-- ============================================================
-- Migration 006: kpi_templates + employee_kpi
-- Шаблоны KPI и индивидуальные планы сотрудников.
-- ============================================================

-- ------------------------------------------------------------
-- Таблица: kpi_templates
-- ------------------------------------------------------------
CREATE TABLE public.kpi_templates (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  role                  TEXT          NOT NULL,
  name                  VARCHAR(100)  NOT NULL,
  is_default            BOOLEAN       NOT NULL DEFAULT false,
  metrics               JSONB         NOT NULL DEFAULT '{}',
  min_threshold_pct     NUMERIC(5,2)  NOT NULL DEFAULT 30.0,
  over_plan_coefficient NUMERIC(5,2)  NOT NULL DEFAULT 1.2,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT kpi_templates_role_check CHECK (role IN ('mp','lmai'))
);

-- Уникальный частичный индекс: только один default на каждую роль
CREATE UNIQUE INDEX idx_kpi_templates_one_default
  ON public.kpi_templates(role)
  WHERE is_default = true;

-- Индексы
CREATE INDEX idx_kpi_templates_role ON public.kpi_templates(role);

-- Триггер updated_at
CREATE TRIGGER set_kpi_templates_updated_at
  BEFORE UPDATE ON public.kpi_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.kpi_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kpi_templates_select_authenticated"
  ON public.kpi_templates FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "kpi_templates_insert_owner"
  ON public.kpi_templates FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_role() = 'owner');

CREATE POLICY "kpi_templates_update_owner"
  ON public.kpi_templates FOR UPDATE
  TO authenticated
  USING (public.get_my_role() = 'owner');

CREATE POLICY "kpi_templates_delete_owner"
  ON public.kpi_templates FOR DELETE
  TO authenticated
  USING (public.get_my_role() = 'owner');

-- Seed: шаблоны KPI по умолчанию
INSERT INTO public.kpi_templates (role, name, is_default, metrics, min_threshold_pct, over_plan_coefficient) VALUES
(
  'mp',
  'Стандартный шаблон МП',
  true,
  '{"fv":{"label":"ФВ","weight":40},"sales":{"label":"Продажи","weight":35},"revenue":{"label":"Выручка","weight":25}}',
  30.0,
  1.2
),
(
  'lmai',
  'Стандартный шаблон LMAI',
  true,
  '{"appeals":{"label":"Обращения","weight":40},"leads":{"label":"Лиды","weight":40},"nv":{"label":"НВ","weight":20}}',
  30.0,
  1.2
);

-- ------------------------------------------------------------
-- Таблица: employee_kpi
-- ------------------------------------------------------------
CREATE TABLE public.employee_kpi (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id      UUID          NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  period_year      SMALLINT      NOT NULL,
  period_month     SMALLINT      NOT NULL,
  kpi_template_id  UUID          REFERENCES public.kpi_templates(id) ON DELETE SET NULL,
  plan_fv          INTEGER,
  plan_sales       INTEGER,
  plan_revenue     NUMERIC(12,2),
  plan_appeals     INTEGER,
  plan_leads       INTEGER,
  plan_nv          INTEGER,
  plan_work_days   SMALLINT,
  notes            TEXT,
  created_by       UUID          REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT employee_kpi_emp_period_unique UNIQUE (employee_id, period_year, period_month),
  CONSTRAINT employee_kpi_month_check CHECK (period_month BETWEEN 1 AND 12),
  CONSTRAINT employee_kpi_year_check  CHECK (period_year BETWEEN 2020 AND 2100),
  CONSTRAINT employee_kpi_fv_check    CHECK (plan_fv IS NULL OR plan_fv >= 0),
  CONSTRAINT employee_kpi_sales_check CHECK (plan_sales IS NULL OR plan_sales >= 0),
  CONSTRAINT employee_kpi_revenue_check CHECK (plan_revenue IS NULL OR plan_revenue >= 0)
);

-- Индексы
CREATE INDEX idx_employee_kpi_emp_id     ON public.employee_kpi(employee_id);
CREATE INDEX idx_employee_kpi_period     ON public.employee_kpi(period_year, period_month);
CREATE INDEX idx_employee_kpi_emp_period ON public.employee_kpi(employee_id, period_year, period_month);

-- Триггер updated_at
CREATE TRIGGER set_employee_kpi_updated_at
  BEFORE UPDATE ON public.employee_kpi
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.employee_kpi ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employee_kpi_select_owner_rop"
  ON public.employee_kpi FOR SELECT
  TO authenticated
  USING (public.get_my_role() IN ('owner','rop','accountant'));

CREATE POLICY "employee_kpi_select_self"
  ON public.employee_kpi FOR SELECT
  TO authenticated
  USING (
    public.get_my_role() IN ('mp','lmai')
    AND employee_id = public.get_my_employee_id()
  );

CREATE POLICY "employee_kpi_insert_owner_rop"
  ON public.employee_kpi FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_role() IN ('owner','rop'));

CREATE POLICY "employee_kpi_update_owner_rop"
  ON public.employee_kpi FOR UPDATE
  TO authenticated
  USING (public.get_my_role() IN ('owner','rop'));

CREATE POLICY "employee_kpi_delete_owner"
  ON public.employee_kpi FOR DELETE
  TO authenticated
  USING (public.get_my_role() = 'owner');

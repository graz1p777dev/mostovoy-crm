-- Маркетинговая декомпозиция. Идемпотентная версия миграции Samat 033:
-- таблицы уже существуют в текущей production-базе, но отсутствовали в истории репозитория.

INSERT INTO public.roles (name, label, description, permission_level, is_system)
VALUES ('targetolog', 'Таргетолог', 'Таргетированная реклама и лидогенерация из платного трафика', 'employee', false)
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.marketing_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date_start DATE NOT NULL,
  date_end DATE NOT NULL,
  target_budget NUMERIC(14,2) NOT NULL CHECK (target_budget > 0),
  target_appeals INTEGER NOT NULL CHECK (target_appeals > 0),
  created_by UUID REFERENCES public.employees(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'marketing_plans_dates_valid') THEN
    ALTER TABLE public.marketing_plans
      ADD CONSTRAINT marketing_plans_dates_valid CHECK (date_end >= date_start);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'marketing_plans_no_overlap') THEN
    ALTER TABLE public.marketing_plans
      ADD CONSTRAINT marketing_plans_no_overlap
      EXCLUDE USING gist (daterange(date_start, date_end, '[]') WITH &&);
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_marketing_plans_updated_at ON public.marketing_plans;
CREATE TRIGGER trg_marketing_plans_updated_at
  BEFORE UPDATE ON public.marketing_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.marketing_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS marketing_plans_select ON public.marketing_plans;
DROP POLICY IF EXISTS marketing_plans_insert ON public.marketing_plans;
DROP POLICY IF EXISTS marketing_plans_update ON public.marketing_plans;
DROP POLICY IF EXISTS marketing_plans_delete ON public.marketing_plans;
CREATE POLICY marketing_plans_select ON public.marketing_plans FOR SELECT TO authenticated USING (true);
CREATE POLICY marketing_plans_insert ON public.marketing_plans FOR INSERT TO authenticated WITH CHECK (get_my_role() = 'owner');
CREATE POLICY marketing_plans_update ON public.marketing_plans FOR UPDATE TO authenticated USING (get_my_role() = 'owner');
CREATE POLICY marketing_plans_delete ON public.marketing_plans FOR DELETE TO authenticated USING (get_my_role() = 'owner');

CREATE TABLE IF NOT EXISTS public.marketing_daily_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id),
  date DATE NOT NULL,
  active_campaigns INTEGER NOT NULL DEFAULT 0 CHECK (active_campaigns >= 0),
  reach INTEGER NOT NULL DEFAULT 0 CHECK (reach >= 0),
  clicks INTEGER NOT NULL DEFAULT 0 CHECK (clicks >= 0),
  budget NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (budget >= 0),
  ad_appeals INTEGER NOT NULL DEFAULT 0 CHECK (ad_appeals >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT marketing_daily_emp_date_unique UNIQUE (employee_id, date)
);

DROP TRIGGER IF EXISTS trg_marketing_daily_updated_at ON public.marketing_daily_data;
CREATE TRIGGER trg_marketing_daily_updated_at
  BEFORE UPDATE ON public.marketing_daily_data
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.marketing_daily_data ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS marketing_daily_select ON public.marketing_daily_data;
DROP POLICY IF EXISTS marketing_daily_insert ON public.marketing_daily_data;
DROP POLICY IF EXISTS marketing_daily_update ON public.marketing_daily_data;
CREATE POLICY marketing_daily_select ON public.marketing_daily_data FOR SELECT TO authenticated USING (true);
CREATE POLICY marketing_daily_insert ON public.marketing_daily_data FOR INSERT TO authenticated
  WITH CHECK (employee_id = get_my_employee_id() OR get_my_role() = 'owner' OR get_my_permission_level() = 'department_head');
CREATE POLICY marketing_daily_update ON public.marketing_daily_data FOR UPDATE TO authenticated
  USING (employee_id = get_my_employee_id() OR get_my_role() = 'owner' OR get_my_permission_level() = 'department_head');

DROP POLICY IF EXISTS kpi_item_results_insert_self ON public.employee_kpi_item_results;
DROP POLICY IF EXISTS kpi_item_results_update_self ON public.employee_kpi_item_results;
CREATE POLICY kpi_item_results_insert_self ON public.employee_kpi_item_results
  FOR INSERT TO authenticated
  WITH CHECK (
    employee_id = get_my_employee_id()
    AND EXISTS (
      SELECT 1
      FROM public.kpi_items ki
      JOIN public.kpi_role_settings krs ON krs.id = ki.role_setting_id
      JOIN public.employees e ON e.role = krs.role_name
      WHERE ki.id = employee_kpi_item_results.kpi_item_id
        AND e.id = get_my_employee_id()
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.employee_kpi_results r
      WHERE r.employee_id = employee_kpi_item_results.employee_id
        AND r.period_year = employee_kpi_item_results.period_year
        AND r.period_month = employee_kpi_item_results.period_month
        AND r.is_closed = true
    )
  );
CREATE POLICY kpi_item_results_update_self ON public.employee_kpi_item_results
  FOR UPDATE TO authenticated
  USING (
    employee_id = get_my_employee_id()
    AND NOT EXISTS (
      SELECT 1 FROM public.employee_kpi_results r
      WHERE r.employee_id = employee_kpi_item_results.employee_id
        AND r.period_year = employee_kpi_item_results.period_year
        AND r.period_month = employee_kpi_item_results.period_month
        AND r.is_closed = true
    )
  );


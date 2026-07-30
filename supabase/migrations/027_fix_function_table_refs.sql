-- Fix: обновляем функции, которые ссылались на таблицы по старым именам.
-- Переименования произошли после применения миграций 016 и 021:
--   daily_facts     → daily_activity
--   decomposition   → sales_plan_weekly
--   finances        → finance_periods

-- ────────────────────────────────────────────────────────────────
-- 1. recalculate_decomposition — fix daily_activity + sales_plan_weekly
-- ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.recalculate_decomposition(
  p_employee_id UUID,
  p_year        SMALLINT,
  p_month       SMALLINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_date_start   DATE;
  v_date_end     DATE;
  v_fv_fact      INTEGER := 0;
  v_sales_fact   INTEGER := 0;
  v_revenue_fact NUMERIC(12,2) := 0;
  v_work_days_f  SMALLINT := 0;
  v_plan_fv      INTEGER := 0;
  v_plan_sales   INTEGER := 0;
  v_plan_revenue NUMERIC(12,2) := 0;
  v_plan_days    SMALLINT := 0;
  v_kpi_pct      NUMERIC(5,2) := 0;
  v_template     RECORD;
BEGIN
  v_date_start := MAKE_DATE(p_year::INT, p_month::INT, 1);
  v_date_end   := (v_date_start + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

  -- Факт ФВ: из consultations (actual_status = 'Пришла'), override из daily_activity
  SELECT
    COALESCE(SUM(
      COALESCE(
        df.fv_fact,
        (SELECT COUNT(*) FROM public.consultations c
         WHERE c.manager_id = p_employee_id
           AND c.date = s.d
           AND c.actual_status = 'Пришла'
           AND c.deleted_at IS NULL)::INTEGER
      )
    ), 0)
  INTO v_fv_fact
  FROM (
    SELECT generate_series(v_date_start, v_date_end, '1 day'::INTERVAL)::DATE AS d
  ) s
  LEFT JOIN public.daily_activity df
    ON df.employee_id = p_employee_id AND df.date = s.d;

  -- Факт продаж: из consultations (status_after_fv IN ('Купила','Предоплата'))
  SELECT
    COALESCE(SUM(
      COALESCE(
        df.sales_fact,
        (SELECT COUNT(*) FROM public.consultations c
         WHERE c.manager_id = p_employee_id
           AND c.date = s.d
           AND c.status_after_fv IN ('Купила','Предоплата')
           AND c.deleted_at IS NULL)::INTEGER
      )
    ), 0)
  INTO v_sales_fact
  FROM (
    SELECT generate_series(v_date_start, v_date_end, '1 day'::INTERVAL)::DATE AS d
  ) s
  LEFT JOIN public.daily_activity df
    ON df.employee_id = p_employee_id AND df.date = s.d;

  -- Факт выручки
  SELECT
    COALESCE(SUM(
      COALESCE(
        df.revenue_fact,
        (SELECT COALESCE(SUM(c.amount), 0) FROM public.consultations c
         WHERE c.manager_id = p_employee_id
           AND c.date = s.d
           AND c.status_after_fv IN ('Купила','Предоплата')
           AND c.deleted_at IS NULL)
      )
    ), 0)
  INTO v_revenue_fact
  FROM (
    SELECT generate_series(v_date_start, v_date_end, '1 day'::INTERVAL)::DATE AS d
  ) s
  LEFT JOIN public.daily_activity df
    ON df.employee_id = p_employee_id AND df.date = s.d;

  -- Рабочих дней факт (из attendance)
  SELECT COUNT(*)
  INTO v_work_days_f
  FROM public.attendance
  WHERE employee_id = p_employee_id
    AND date BETWEEN v_date_start AND v_date_end
    AND status = 'worked';

  -- Планы из employee_kpi
  SELECT
    COALESCE(plan_fv, 0),
    COALESCE(plan_sales, 0),
    COALESCE(plan_revenue, 0),
    COALESCE(plan_work_days, 0)
  INTO v_plan_fv, v_plan_sales, v_plan_revenue, v_plan_days
  FROM public.employee_kpi
  WHERE employee_id = p_employee_id
    AND period_year = p_year
    AND period_month = p_month;

  -- Guard: SELECT INTO returns NULL for all vars when no row found
  v_plan_fv      := COALESCE(v_plan_fv, 0);
  v_plan_sales   := COALESCE(v_plan_sales, 0);
  v_plan_revenue := COALESCE(v_plan_revenue, 0);
  v_plan_days    := COALESCE(v_plan_days, 0);

  -- KPI% расчёт (взвешенный по шаблону)
  SELECT kt.*
  INTO v_template
  FROM public.kpi_templates kt
  JOIN public.employees e ON e.role = kt.role
  WHERE e.id = p_employee_id
    AND kt.is_default = true
  LIMIT 1;

  IF v_template IS NOT NULL THEN
    DECLARE
      v_fv_pct   NUMERIC := CASE WHEN v_plan_fv > 0 THEN LEAST((v_fv_fact::NUMERIC / v_plan_fv) * 100, 200) ELSE 0 END;
      v_s_pct    NUMERIC := CASE WHEN v_plan_sales > 0 THEN LEAST((v_sales_fact::NUMERIC / v_plan_sales) * 100, 200) ELSE 0 END;
      v_r_pct    NUMERIC := CASE WHEN v_plan_revenue > 0 THEN LEAST((v_revenue_fact / v_plan_revenue) * 100, 200) ELSE 0 END;
      v_fv_w     NUMERIC := COALESCE((v_template.metrics->'fv'->>'weight')::NUMERIC, 0);
      v_s_w      NUMERIC := COALESCE((v_template.metrics->'sales'->>'weight')::NUMERIC, 0);
      v_r_w      NUMERIC := COALESCE((v_template.metrics->'revenue'->>'weight')::NUMERIC, 0);
      v_total_w  NUMERIC := v_fv_w + v_s_w + v_r_w;
    BEGIN
      IF v_total_w > 0 THEN
        v_kpi_pct := ROUND(
          (v_fv_pct * v_fv_w + v_s_pct * v_s_w + v_r_pct * v_r_w) / v_total_w,
          2
        );
      END IF;
    END;
  END IF;

  -- Upsert в sales_plan_weekly (таблица переименована из decomposition)
  INSERT INTO public.sales_plan_weekly (
    employee_id, period_year, period_month,
    total_fv_plan, total_fv_fact,
    total_sales_plan, total_sales_fact,
    total_revenue_plan, total_revenue_fact,
    total_work_days_plan, total_work_days_fact,
    kpi_pct, last_calculated_at
  )
  VALUES (
    p_employee_id, p_year, p_month,
    v_plan_fv, v_fv_fact,
    v_plan_sales, v_sales_fact,
    v_plan_revenue, v_revenue_fact,
    v_plan_days, v_work_days_f,
    v_kpi_pct, NOW()
  )
  ON CONFLICT (employee_id, period_year, period_month)
  DO UPDATE SET
    total_fv_plan        = EXCLUDED.total_fv_plan,
    total_fv_fact        = EXCLUDED.total_fv_fact,
    total_sales_plan     = EXCLUDED.total_sales_plan,
    total_sales_fact     = EXCLUDED.total_sales_fact,
    total_revenue_plan   = EXCLUDED.total_revenue_plan,
    total_revenue_fact   = EXCLUDED.total_revenue_fact,
    total_work_days_plan = EXCLUDED.total_work_days_plan,
    total_work_days_fact = EXCLUDED.total_work_days_fact,
    kpi_pct              = EXCLUDED.kpi_pct,
    last_calculated_at   = NOW(),
    updated_at           = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalculate_decomposition(UUID, SMALLINT, SMALLINT) TO authenticated;

-- ────────────────────────────────────────────────────────────────
-- 2. recalculate_finances — fix finance_periods
-- ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.recalculate_finances(
  p_year  SMALLINT,
  p_month SMALLINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_date_start  DATE;
  v_date_end    DATE;
  v_income      NUMERIC(12,2) := 0;
  v_expense     NUMERIC(12,2) := 0;
  v_net         NUMERIC(12,2) := 0;
  v_margin      NUMERIC(5,2)  := 0;
BEGIN
  v_date_start := MAKE_DATE(p_year::INT, p_month::INT, 1);
  v_date_end   := (v_date_start + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

  SELECT
    COALESCE(SUM(CASE WHEN type = 'income'  THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0)
  INTO v_income, v_expense
  FROM public.finance_transactions
  WHERE date BETWEEN v_date_start AND v_date_end
    AND deleted_at IS NULL;

  v_net    := v_income - v_expense;
  v_margin := CASE WHEN v_income > 0 THEN ROUND((v_net / v_income) * 100, 2) ELSE 0 END;

  -- Upsert в finance_periods (таблица переименована из finances)
  INSERT INTO public.finance_periods (
    period_year, period_month,
    total_income, total_expense, net_profit, margin_pct,
    last_calculated_at
  )
  VALUES (
    p_year, p_month,
    v_income, v_expense, v_net, v_margin,
    NOW()
  )
  ON CONFLICT (period_year, period_month)
  DO UPDATE SET
    total_income       = EXCLUDED.total_income,
    total_expense      = EXCLUDED.total_expense,
    net_profit         = EXCLUDED.net_profit,
    margin_pct         = EXCLUDED.margin_pct,
    last_calculated_at = NOW(),
    updated_at         = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalculate_finances(SMALLINT, SMALLINT) TO authenticated;

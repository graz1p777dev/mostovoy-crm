-- ============================================================
-- Migration 016: Business Functions
-- Бизнес-логика: пересчёт декомпозиции, финансов, расписания,
-- зарплаты. Вызываются через триггеры и Server Actions.
-- ============================================================

-- ------------------------------------------------------------
-- Функция: recalculate_decomposition(p_employee_id, p_year, p_month)
-- Пересчитывает агрегат план-факт за месяц для сотрудника.
-- Источник факта: consultations (primary) + daily_facts (override).
-- ------------------------------------------------------------
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

  -- Факт ФВ: считаем из consultations (actual_status = 'Пришла')
  -- Если есть daily_facts override — используем его
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
  LEFT JOIN public.daily_facts df
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
  LEFT JOIN public.daily_facts df
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
  LEFT JOIN public.daily_facts df
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

  -- KPI% расчёт (взвешенный по шаблону)
  -- Простая формула MVP: среднее % выполнения по метрикам с весами
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

  -- Upsert в decomposition
  INSERT INTO public.decomposition (
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

-- ------------------------------------------------------------
-- Функция: recalculate_finances(p_year, p_month)
-- Пересчитывает агрегат finances из finance_transactions.
-- ------------------------------------------------------------
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

  INSERT INTO public.finances (
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

-- ------------------------------------------------------------
-- Функция: generate_monthly_schedule(p_employee_id, p_year, p_month)
-- Генерирует расписание для сотрудника на месяц
-- на основе employees.schedule_type.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_monthly_schedule(
  p_employee_id UUID,
  p_year        SMALLINT,
  p_month       SMALLINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_date_start    DATE;
  v_date_end      DATE;
  v_current_date  DATE;
  v_schedule_type TEXT;
  v_work_start    TIME;
  v_work_end      TIME;
  v_is_workday    BOOLEAN;
  v_dow           INTEGER; -- day of week: 1=Mon, 7=Sun
  v_day_num       INTEGER := 0;
BEGIN
  v_date_start := MAKE_DATE(p_year::INT, p_month::INT, 1);
  v_date_end   := (v_date_start + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

  SELECT schedule_type, work_start_time, work_end_time
  INTO v_schedule_type, v_work_start, v_work_end
  FROM public.employees
  WHERE id = p_employee_id;

  v_current_date := v_date_start;

  WHILE v_current_date <= v_date_end LOOP
    v_dow     := EXTRACT(ISODOW FROM v_current_date)::INTEGER;
    v_day_num := v_day_num + 1;

    v_is_workday := CASE v_schedule_type
      WHEN '5/2'     THEN v_dow BETWEEN 1 AND 5
      WHEN 'weekends'THEN v_dow BETWEEN 6 AND 7
      WHEN '2/2'     THEN (v_day_num % 4) IN (1, 2)
      WHEN '1/1'     THEN (v_day_num % 2) = 1
      WHEN '3/3'     THEN (v_day_num % 6) IN (1, 2, 3)
      WHEN 'custom'  THEN true  -- custom задаётся вручную
      ELSE v_dow BETWEEN 1 AND 5
    END;

    INSERT INTO public.schedules (employee_id, date, is_workday, work_start, work_end)
    VALUES (p_employee_id, v_current_date, v_is_workday, v_work_start, v_work_end)
    ON CONFLICT (employee_id, date)
    DO NOTHING; -- не перезаписываем ручные изменения

    v_current_date := v_current_date + 1;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_monthly_schedule(UUID, SMALLINT, SMALLINT) TO authenticated;

-- ------------------------------------------------------------
-- Функция: calculate_salary(p_employee_id, p_year, p_month)
-- Рассчитывает зарплату сотрудника за месяц.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_salary(
  p_employee_id UUID,
  p_year        SMALLINT,
  p_month       SMALLINT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_emp             RECORD;
  v_decomp          RECORD;
  v_template        RECORD;
  v_work_days_plan  SMALLINT := 0;
  v_work_days_fact  SMALLINT := 0;
  v_base            NUMERIC(12,2) := 0;
  v_day_rate        NUMERIC(12,2) := 0;
  v_base_adjusted   NUMERIC(12,2) := 0;
  v_kpi_bonus       NUMERIC(12,2) := 0;
  v_total           NUMERIC(12,2) := 0;
  v_salary_id       UUID;
BEGIN
  -- Данные сотрудника
  SELECT * INTO v_emp FROM public.employees WHERE id = p_employee_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee % not found', p_employee_id;
  END IF;

  -- Декомпозиция за месяц
  SELECT * INTO v_decomp
  FROM public.decomposition
  WHERE employee_id = p_employee_id
    AND period_year = p_year AND period_month = p_month;

  -- Рабочие дни (план из schedules)
  SELECT COUNT(*) INTO v_work_days_plan
  FROM public.schedules
  WHERE employee_id = p_employee_id
    AND EXTRACT(YEAR FROM date) = p_year
    AND EXTRACT(MONTH FROM date) = p_month
    AND is_workday = true;

  -- Рабочие дни факт (из attendance)
  SELECT COUNT(*) INTO v_work_days_fact
  FROM public.attendance
  WHERE employee_id = p_employee_id
    AND EXTRACT(YEAR FROM date) = p_year
    AND EXTRACT(MONTH FROM date) = p_month
    AND status = 'worked';

  -- Базовая зарплата с корректировкой по дням
  v_base := v_emp.base_salary;
  IF v_work_days_plan > 0 THEN
    v_day_rate      := v_base / v_work_days_plan;
    v_base_adjusted := ROUND(v_day_rate * v_work_days_fact, 2);
  ELSE
    v_base_adjusted := v_base;
  END IF;

  -- KPI бонус
  IF v_decomp IS NOT NULL AND v_decomp.kpi_pct >= 30 THEN
    DECLARE
      v_coeff NUMERIC := 1.0;
    BEGIN
      SELECT kt.over_plan_coefficient INTO v_coeff
      FROM public.kpi_templates kt
      WHERE kt.role = v_emp.role AND kt.is_default = true
      LIMIT 1;

      v_kpi_bonus := ROUND(
        v_base * v_emp.kpi_coefficient *
        CASE
          WHEN v_decomp.kpi_pct >= 100 THEN COALESCE(v_coeff, 1.2)
          ELSE v_decomp.kpi_pct / 100
        END,
        2
      );
    END;
  END IF;

  v_total := v_base_adjusted + v_kpi_bonus;

  -- Upsert salary
  INSERT INTO public.salaries (
    employee_id, period_year, period_month,
    base_salary, kpi_bonus, bonuses, deductions, total_amount,
    kpi_pct, work_days_fact, work_days_plan,
    status, calculated_at
  )
  VALUES (
    p_employee_id, p_year, p_month,
    v_base_adjusted, v_kpi_bonus, 0, 0, v_total,
    COALESCE(v_decomp.kpi_pct, 0),
    v_work_days_fact, v_work_days_plan,
    'calculated', NOW()
  )
  ON CONFLICT (employee_id, period_year, period_month)
  DO UPDATE SET
    base_salary     = EXCLUDED.base_salary,
    kpi_bonus       = EXCLUDED.kpi_bonus,
    total_amount    = EXCLUDED.total_amount,
    kpi_pct         = EXCLUDED.kpi_pct,
    work_days_fact  = EXCLUDED.work_days_fact,
    work_days_plan  = EXCLUDED.work_days_plan,
    status          = 'calculated',
    calculated_at   = NOW(),
    updated_at      = NOW()
  RETURNING id INTO v_salary_id;

  -- Детали расчёта в salary_calculations
  DELETE FROM public.salary_calculations WHERE salary_id = v_salary_id;

  INSERT INTO public.salary_calculations (salary_id, type, description, amount, metric_name, metric_plan, metric_fact, metric_pct)
  VALUES
    (v_salary_id, 'base_salary',    'Базовый оклад', v_emp.base_salary, NULL, NULL, NULL, NULL),
    (v_salary_id, 'day_adjustment', 'Корректировка по дням (' || v_work_days_fact || '/' || v_work_days_plan || ')',
     v_base_adjusted - v_emp.base_salary, 'Рабочие дни', v_work_days_plan, v_work_days_fact, NULL),
    (v_salary_id, 'kpi_bonus',      'KPI бонус', v_kpi_bonus,
     'KPI%', NULL, COALESCE(v_decomp.kpi_pct, 0), COALESCE(v_decomp.kpi_pct, 0));

  RETURN v_salary_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.calculate_salary(UUID, SMALLINT, SMALLINT) TO authenticated;

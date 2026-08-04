-- ── Переключение plan_bonus на индивидуальную декомпозицию МП ─────────────────
--
-- Решение (утверждено): % выполнения плана для ступенчатого бонуса берётся
-- из МП-декомпозиции (company_plans → деление поровну → факт по manager_id),
-- метрика — ВЫРУЧКА. Старая формула sales_plan_weekly.kpi_pct остаётся только
-- ВИТРИНОЙ для дашбордов и НЕ участвует в зарплатных расчётах.
-- Планы компании — строго помесячно (1-е — последнее число месяца).
-- Нет активного плана на месяц → % = 0, бонус = 0 (жёсткий ноль, без fallback).
--
-- Математика деления обязана 1:1 совпадать с src/lib/decomposition/schedule.ts
-- (distEven) и src/actions/mp-decomposition.ts — подтверждается сверочным тестом.

-- ── 1. get_mp_plan_completion_pct ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_mp_plan_completion_pct(
  p_employee_id UUID,
  p_year        SMALLINT,
  p_month       SMALLINT
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_month_start   DATE;
  v_month_end     DATE;
  v_plan          RECORD;
  v_mp_count      INTEGER;
  v_mp_index      INTEGER;   -- 0-based позиция сотрудника в списке МП (ORDER BY created_at)
  v_target_total  NUMERIC;
  v_personal      NUMERIC;
  v_base          NUMERIC;
  v_rem           NUMERIC;
  v_fact          NUMERIC := 0;
  v_fact_end      DATE;
BEGIN
  v_month_start := MAKE_DATE(p_year::INT, p_month::INT, 1);
  v_month_end   := (v_month_start + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

  -- План компании, покрывающий календарный месяц (планы ведутся помесячно)
  SELECT id, date_start, date_end, target_revenue
  INTO v_plan
  FROM public.company_plans
  WHERE date_start <= v_month_start AND date_end >= v_month_end
  LIMIT 1;

  IF v_plan IS NULL THEN
    RETURN 0;  -- нет плана — жёсткий ноль (осознанное решение)
  END IF;

  -- Позиция сотрудника среди активных МП (детерминированный порядок по created_at)
  SELECT COUNT(*) INTO v_mp_count
  FROM public.employees
  WHERE role = 'mp' AND deleted_at IS NULL;

  SELECT idx INTO v_mp_index
  FROM (
    SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) - 1 AS idx
    FROM public.employees
    WHERE role = 'mp' AND deleted_at IS NULL
  ) mp_list
  WHERE id = p_employee_id;

  IF v_mp_index IS NULL OR v_mp_count = 0 THEN
    RETURN 0;  -- сотрудник не активный МП — источник неприменим
  END IF;

  -- Личный план выручки: distEven — зеркало schedule.ts
  v_target_total := v_plan.target_revenue;
  IF v_mp_count = 1 THEN
    v_personal := v_target_total;                       -- без округления
  ELSE
    v_target_total := ROUND(v_target_total);
    v_base := FLOOR(v_target_total / v_mp_count);
    v_rem  := v_target_total - v_base * v_mp_count;
    v_personal := v_base + CASE WHEN v_mp_index < v_rem THEN 1 ELSE 0 END;
  END IF;

  IF v_personal <= 0 THEN
    RETURN 0;
  END IF;

  -- Факт выручки сотрудника: по дням, приоритет override из daily_activity,
  -- иначе consultations (Купила/Предоплата). Дни — только до сегодня включительно
  -- (зеркало factToDate из mp-decomposition.ts).
  v_fact_end := LEAST(CURRENT_DATE, v_plan.date_end);
  IF v_fact_end >= v_plan.date_start THEN
    SELECT COALESCE(SUM(
      COALESCE(
        (SELECT SUM(da.revenue_fact)
         FROM public.daily_activity da
         WHERE da.employee_id = p_employee_id
           AND da.date = s.d
           AND da.revenue_fact IS NOT NULL),
        (SELECT COALESCE(SUM(c.amount), 0)
         FROM public.consultations c
         WHERE c.manager_id = p_employee_id
           AND c.date = s.d
           AND c.status_after_fv IN ('Купила', 'Предоплата')
           AND c.deleted_at IS NULL)
      )
    ), 0)
    INTO v_fact
    FROM (
      SELECT generate_series(v_plan.date_start, v_fact_end, '1 day'::INTERVAL)::DATE AS d
    ) s;
  END IF;

  RETURN ROUND((v_fact / v_personal) * 100, 2);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_mp_plan_completion_pct(UUID, SMALLINT, SMALLINT) TO authenticated;

-- ── 2. recalculate_kpi_results: plan_bonus от новой функции ───────────────────
-- Изменена ТОЛЬКО секция расчёта v_plan_pct (было: чтение sales_plan_weekly.kpi_pct).
-- Ступени, items, daily, защита is_closed — без изменений (версия из 029).

CREATE OR REPLACE FUNCTION public.recalculate_kpi_results(
  p_employee_id UUID,
  p_year        SMALLINT,
  p_month       SMALLINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role_setting_id UUID;
  v_plan_pct        NUMERIC(5,2)  := 0;
  v_plan_bonus      NUMERIC(12,2) := 0;
  v_items_bonus     NUMERIC(12,2) := 0;
  v_daily_bonus     NUMERIC(12,2) := 0;
  v_date_start      DATE;
  v_date_end        DATE;
  v_plan_block_id   UUID;
  v_daily_block_id  UUID;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.employee_kpi_results
    WHERE employee_id = p_employee_id
      AND period_year  = p_year
      AND period_month = p_month
      AND is_closed = true
  ) THEN
    RETURN;
  END IF;

  SELECT krs.id INTO v_role_setting_id
  FROM public.kpi_role_settings krs
  JOIN public.employees e ON e.role = krs.role_name
  WHERE e.id = p_employee_id
    AND krs.is_active = true
  LIMIT 1;

  IF v_role_setting_id IS NULL THEN
    RETURN;
  END IF;

  v_date_start := MAKE_DATE(p_year::INT, p_month::INT, 1);
  v_date_end   := (v_date_start + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

  SELECT id INTO v_plan_block_id
  FROM public.kpi_bonus_blocks
  WHERE role_setting_id = v_role_setting_id AND block_type = 'plan'
  LIMIT 1;

  SELECT id INTO v_daily_block_id
  FROM public.kpi_bonus_blocks
  WHERE role_setting_id = v_role_setting_id AND block_type = 'daily'
  LIMIT 1;

  -- 1. % выполнения плана — из индивидуальной декомпозиции МП (миграция 032).
  --    sales_plan_weekly.kpi_pct — ТОЛЬКО витрина дашбордов, здесь не используется.
  --    Для ролей вне МП-декомпозиции функция возвращает 0 (источник появится
  --    при построении их индивидуальной декомпозиции).
  v_plan_pct := COALESCE(public.get_mp_plan_completion_pct(p_employee_id, p_year, p_month), 0);

  -- 2. plan_bonus: ступень по %
  IF v_plan_block_id IS NOT NULL THEN
    SELECT COALESCE(bt.bonus_amount, 0)
    INTO v_plan_bonus
    FROM public.kpi_bonus_tiers bt
    WHERE bt.block_id  = v_plan_block_id
      AND bt.tier_from <= v_plan_pct
      AND (bt.tier_to IS NULL OR v_plan_pct <= bt.tier_to)
    ORDER BY bt.tier_from DESC
    LIMIT 1;
  END IF;

  v_plan_bonus := COALESCE(v_plan_bonus, 0);

  -- 3. items_bonus
  SELECT COALESCE(SUM(ki.bonus_amount), 0)
  INTO v_items_bonus
  FROM public.employee_kpi_item_results ekir
  JOIN public.kpi_items ki ON ki.id = ekir.kpi_item_id
  WHERE ekir.employee_id  = p_employee_id
    AND ekir.period_year  = p_year
    AND ekir.period_month = p_month
    AND ekir.is_completed = true
    AND ki.is_active = true
    AND ki.role_setting_id = v_role_setting_id;

  v_items_bonus := COALESCE(v_items_bonus, 0);

  -- 4. daily_bonus
  IF v_daily_block_id IS NOT NULL THEN
    SELECT COALESCE(SUM(
      (SELECT COALESCE(bt.bonus_amount, 0)
       FROM public.kpi_bonus_tiers bt
       WHERE bt.block_id  = v_daily_block_id
         AND bt.tier_from <= COALESCE(da.revenue_fact, 0)
         AND (bt.tier_to IS NULL OR COALESCE(da.revenue_fact, 0) < bt.tier_to)
       ORDER BY bt.tier_from DESC
       LIMIT 1)
    ), 0)
    INTO v_daily_bonus
    FROM public.daily_activity da
    WHERE da.employee_id = p_employee_id
      AND da.date BETWEEN v_date_start AND v_date_end;
  END IF;

  v_daily_bonus := COALESCE(v_daily_bonus, 0);

  -- 5. Upsert (закрытые месяцы не трогаются)
  INSERT INTO public.employee_kpi_results (
    employee_id, period_year, period_month,
    plan_completion_pct, plan_bonus, items_bonus, daily_bonus,
    total_bonus
  )
  VALUES (
    p_employee_id, p_year, p_month,
    v_plan_pct, v_plan_bonus, v_items_bonus, v_daily_bonus,
    v_plan_bonus + v_items_bonus + v_daily_bonus
  )
  ON CONFLICT (employee_id, period_year, period_month)
  DO UPDATE SET
    plan_completion_pct = EXCLUDED.plan_completion_pct,
    plan_bonus          = EXCLUDED.plan_bonus,
    items_bonus         = EXCLUDED.items_bonus,
    daily_bonus         = EXCLUDED.daily_bonus,
    total_bonus         = EXCLUDED.total_bonus,
    updated_at          = NOW()
  WHERE employee_kpi_results.is_closed = false;
END;
$$;

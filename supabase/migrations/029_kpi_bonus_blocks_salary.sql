-- ── Часть 1: Добавляем поля оклада в kpi_role_settings ──────────────────────

ALTER TABLE public.kpi_role_settings
  ADD COLUMN salary_type    TEXT NOT NULL DEFAULT 'fixed'
                            CHECK (salary_type IN ('fixed', 'per_shift')),
  ADD COLUMN salary_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN rate_per_shift NUMERIC(12,2) NOT NULL DEFAULT 0;

-- ── Часть 2: Создаём kpi_bonus_blocks ────────────────────────────────────────

CREATE TABLE public.kpi_bonus_blocks (
  id               UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  role_setting_id  UUID      NOT NULL REFERENCES public.kpi_role_settings(id) ON DELETE CASCADE,
  name             TEXT      NOT NULL,
  block_type       TEXT      NOT NULL DEFAULT 'custom'
                             CHECK (block_type IN ('plan', 'daily', 'custom')),
  value_label_from TEXT      NOT NULL DEFAULT '%',
  value_label_to   TEXT      NOT NULL DEFAULT '%',
  sort_order       SMALLINT  NOT NULL DEFAULT 0
);

-- ── Часть 3: Создаём kpi_bonus_tiers ─────────────────────────────────────────

CREATE TABLE public.kpi_bonus_tiers (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id     UUID          NOT NULL REFERENCES public.kpi_bonus_blocks(id) ON DELETE CASCADE,
  tier_from    NUMERIC       NOT NULL DEFAULT 0,
  tier_to      NUMERIC,
  bonus_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  sort_order   SMALLINT      NOT NULL DEFAULT 0
);

-- ── Часть 4: Мигрируем kpi_plan_tiers → kpi_bonus_blocks/tiers (block_type='plan') ──

INSERT INTO public.kpi_bonus_blocks (role_setting_id, name, block_type, value_label_from, value_label_to, sort_order)
SELECT id, 'Бонус за выполнение плана', 'plan', '%', '%', 0
FROM public.kpi_role_settings;

INSERT INTO public.kpi_bonus_tiers (block_id, tier_from, tier_to, bonus_amount, sort_order)
SELECT bb.id, pt.pct_from, pt.pct_to, pt.bonus_amount, pt.sort_order
FROM public.kpi_plan_tiers pt
JOIN public.kpi_bonus_blocks bb
  ON bb.role_setting_id = pt.role_setting_id AND bb.block_type = 'plan';

-- ── Часть 5: Мигрируем kpi_daily_tiers → kpi_bonus_blocks/tiers (block_type='daily') ──

INSERT INTO public.kpi_bonus_blocks (role_setting_id, name, block_type, value_label_from, value_label_to, sort_order)
SELECT id, 'Ежедневный бонус', 'daily', 'сом', 'сом', 1
FROM public.kpi_role_settings;

INSERT INTO public.kpi_bonus_tiers (block_id, tier_from, tier_to, bonus_amount, sort_order)
SELECT bb.id, dt.revenue_from, dt.revenue_to, dt.bonus_amount, dt.sort_order
FROM public.kpi_daily_tiers dt
JOIN public.kpi_bonus_blocks bb
  ON bb.role_setting_id = dt.role_setting_id AND bb.block_type = 'daily';

-- ── Часть 6: Обновляем recalculate_kpi_results — теперь использует новые таблицы ──

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

  SELECT COALESCE(kpi_pct, 0)
  INTO v_plan_pct
  FROM public.sales_plan_weekly
  WHERE employee_id  = p_employee_id
    AND period_year  = p_year
    AND period_month = p_month;

  v_plan_pct := COALESCE(v_plan_pct, 0);

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

-- ── Часть 7: Дропаем старые таблицы (данные перенесены) ──────────────────────

DROP TABLE public.kpi_plan_tiers;
DROP TABLE public.kpi_daily_tiers;

-- ── Часть 8: RLS на новых таблицах ───────────────────────────────────────────

ALTER TABLE public.kpi_bonus_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_bonus_tiers  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kpi_bonus_blocks_select" ON public.kpi_bonus_blocks
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "kpi_bonus_blocks_insert" ON public.kpi_bonus_blocks
  FOR INSERT TO authenticated WITH CHECK (get_my_role() IN ('owner'));
CREATE POLICY "kpi_bonus_blocks_update" ON public.kpi_bonus_blocks
  FOR UPDATE TO authenticated USING (get_my_role() IN ('owner'));
CREATE POLICY "kpi_bonus_blocks_delete" ON public.kpi_bonus_blocks
  FOR DELETE TO authenticated USING (get_my_role() IN ('owner'));

CREATE POLICY "kpi_bonus_tiers_select" ON public.kpi_bonus_tiers
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "kpi_bonus_tiers_insert" ON public.kpi_bonus_tiers
  FOR INSERT TO authenticated WITH CHECK (get_my_role() IN ('owner'));
CREATE POLICY "kpi_bonus_tiers_update" ON public.kpi_bonus_tiers
  FOR UPDATE TO authenticated USING (get_my_role() IN ('owner'));
CREATE POLICY "kpi_bonus_tiers_delete" ON public.kpi_bonus_tiers
  FOR DELETE TO authenticated USING (get_my_role() IN ('owner'));

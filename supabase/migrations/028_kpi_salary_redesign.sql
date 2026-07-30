-- ============================================================
-- Migration 028: KPI salary redesign
-- Заменяет плоскую взвешенную формулу (kpi_templates) на:
--   1. kpi_role_settings        — конфиг KPI для каждой роли
--   2. kpi_plan_tiers           — ступенчатый бонус по % выполнения плана
--   3. kpi_daily_tiers          — ступенчатый ежедневный бонус по дневной выручке
--   4. kpi_items                — именованные KPI-пункты с фиксированным бонусом
--   5. employee_kpi_results     — ежемесячный итог KPI сотрудника (live → close)
--   6. employee_kpi_item_results — отметки выполнения именованных пунктов
--   7. advance_payments         — авансовые выплаты сотрудникам
--   + ALTER salaries: advance_amount
--   + Functions: recalculate_kpi_results(), close_kpi_month()
--   + Triggers: daily_activity → recalculate_kpi_results
--               sales_plan_weekly → recalculate_kpi_results
--               employee_kpi_item_results → recalculate_kpi_results
-- ============================================================


-- ────────────────────────────────────────────────────────────────
-- 1. kpi_role_settings — один конфиг на роль
-- ────────────────────────────────────────────────────────────────

CREATE TABLE public.kpi_role_settings (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  role_name   TEXT        NOT NULL,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT kpi_role_settings_role_unique UNIQUE (role_name)
);

-- role_name ссылается на roles.name мягко (без hard FK):
-- роли создаются динамически, и история KPI не должна удаляться вместе с ролью
CREATE INDEX idx_kpi_role_settings_role ON public.kpi_role_settings(role_name);

CREATE TRIGGER trg_kpi_role_settings_updated_at
  BEFORE UPDATE ON public.kpi_role_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.kpi_role_settings ENABLE ROW LEVEL SECURITY;

-- Чтение — все авторизованные (фронт должен знать конфиг при расчётах)
CREATE POLICY "kpi_role_settings_select"
  ON public.kpi_role_settings FOR SELECT
  USING (auth.role() = 'authenticated');

-- Изменение — только owner
CREATE POLICY "kpi_role_settings_insert"
  ON public.kpi_role_settings FOR INSERT
  WITH CHECK (public.get_my_role() = 'owner');

CREATE POLICY "kpi_role_settings_update"
  ON public.kpi_role_settings FOR UPDATE
  USING (public.get_my_role() = 'owner');

CREATE POLICY "kpi_role_settings_delete"
  ON public.kpi_role_settings FOR DELETE
  USING (public.get_my_role() = 'owner');


-- ────────────────────────────────────────────────────────────────
-- 2. kpi_plan_tiers — ступенчатый бонус по % выполнения плана
-- ────────────────────────────────────────────────────────────────

CREATE TABLE public.kpi_plan_tiers (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  role_setting_id UUID        NOT NULL REFERENCES public.kpi_role_settings(id) ON DELETE CASCADE,
  pct_from        NUMERIC(5,2) NOT NULL,
  pct_to          NUMERIC(5,2),          -- NULL = без верхней границы (последняя ступень)
  bonus_amount    NUMERIC(12,2) NOT NULL,
  sort_order      SMALLINT    NOT NULL DEFAULT 0,

  CONSTRAINT kpi_plan_tiers_pct_check CHECK (pct_from >= 0 AND (pct_to IS NULL OR pct_to > pct_from)),
  CONSTRAINT kpi_plan_tiers_bonus_check CHECK (bonus_amount >= 0)
);

CREATE INDEX idx_kpi_plan_tiers_setting ON public.kpi_plan_tiers(role_setting_id);

ALTER TABLE public.kpi_plan_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kpi_plan_tiers_select"
  ON public.kpi_plan_tiers FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "kpi_plan_tiers_insert"
  ON public.kpi_plan_tiers FOR INSERT
  WITH CHECK (public.get_my_role() = 'owner');

CREATE POLICY "kpi_plan_tiers_update"
  ON public.kpi_plan_tiers FOR UPDATE
  USING (public.get_my_role() = 'owner');

CREATE POLICY "kpi_plan_tiers_delete"
  ON public.kpi_plan_tiers FOR DELETE
  USING (public.get_my_role() = 'owner');


-- ────────────────────────────────────────────────────────────────
-- 3. kpi_daily_tiers — ступенчатый ежедневный бонус по выручке
-- ────────────────────────────────────────────────────────────────

CREATE TABLE public.kpi_daily_tiers (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  role_setting_id UUID        NOT NULL REFERENCES public.kpi_role_settings(id) ON DELETE CASCADE,
  revenue_from    NUMERIC(12,2) NOT NULL,
  revenue_to      NUMERIC(12,2),         -- NULL = без потолка
  bonus_amount    NUMERIC(12,2) NOT NULL,
  sort_order      SMALLINT    NOT NULL DEFAULT 0,

  CONSTRAINT kpi_daily_tiers_revenue_check CHECK (
    revenue_from >= 0 AND (revenue_to IS NULL OR revenue_to > revenue_from)
  ),
  CONSTRAINT kpi_daily_tiers_bonus_check CHECK (bonus_amount >= 0)
);

CREATE INDEX idx_kpi_daily_tiers_setting ON public.kpi_daily_tiers(role_setting_id);

ALTER TABLE public.kpi_daily_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kpi_daily_tiers_select"
  ON public.kpi_daily_tiers FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "kpi_daily_tiers_insert"
  ON public.kpi_daily_tiers FOR INSERT
  WITH CHECK (public.get_my_role() = 'owner');

CREATE POLICY "kpi_daily_tiers_update"
  ON public.kpi_daily_tiers FOR UPDATE
  USING (public.get_my_role() = 'owner');

CREATE POLICY "kpi_daily_tiers_delete"
  ON public.kpi_daily_tiers FOR DELETE
  USING (public.get_my_role() = 'owner');


-- ────────────────────────────────────────────────────────────────
-- 4. kpi_items — именованные KPI-пункты (ручная отметка)
-- ────────────────────────────────────────────────────────────────

CREATE TABLE public.kpi_items (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  role_setting_id UUID        NOT NULL REFERENCES public.kpi_role_settings(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  description     TEXT,
  bonus_amount    NUMERIC(12,2) NOT NULL,
  sort_order      SMALLINT    NOT NULL DEFAULT 0,
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT kpi_items_bonus_check CHECK (bonus_amount >= 0)
);

CREATE INDEX idx_kpi_items_setting ON public.kpi_items(role_setting_id);

CREATE TRIGGER trg_kpi_items_updated_at
  BEFORE UPDATE ON public.kpi_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.kpi_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kpi_items_select"
  ON public.kpi_items FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "kpi_items_insert"
  ON public.kpi_items FOR INSERT
  WITH CHECK (public.get_my_role() = 'owner');

CREATE POLICY "kpi_items_update"
  ON public.kpi_items FOR UPDATE
  USING (public.get_my_role() = 'owner');

CREATE POLICY "kpi_items_delete"
  ON public.kpi_items FOR DELETE
  USING (public.get_my_role() = 'owner');


-- ────────────────────────────────────────────────────────────────
-- 5. employee_kpi_results — ежемесячный итог KPI сотрудника
-- ────────────────────────────────────────────────────────────────

CREATE TABLE public.employee_kpi_results (
  id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id          UUID          NOT NULL REFERENCES public.employees(id),
  period_year          SMALLINT      NOT NULL,
  period_month         SMALLINT      NOT NULL CHECK (period_month BETWEEN 1 AND 12),

  -- Источник: sales_plan_weekly.kpi_pct; снэпшотируется при пересчёте и при закрытии
  plan_completion_pct  NUMERIC(5,2)  NOT NULL DEFAULT 0,

  plan_bonus           NUMERIC(12,2) NOT NULL DEFAULT 0,  -- по kpi_plan_tiers
  items_bonus          NUMERIC(12,2) NOT NULL DEFAULT 0,  -- сумма выполненных kpi_items
  daily_bonus          NUMERIC(12,2) NOT NULL DEFAULT 0,  -- накопленный ежедневный бонус
  total_bonus          NUMERIC(12,2) NOT NULL DEFAULT 0,  -- plan_bonus + items_bonus + daily_bonus

  -- После закрытия запись read-only (RLS блокирует UPDATE по is_closed = true)
  is_closed            BOOLEAN       NOT NULL DEFAULT false,
  closed_at            TIMESTAMPTZ,
  closed_by            UUID REFERENCES public.employees(id),

  notes                TEXT,
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT employee_kpi_results_unique UNIQUE (employee_id, period_year, period_month)
);

CREATE INDEX idx_employee_kpi_results_emp    ON public.employee_kpi_results(employee_id);
CREATE INDEX idx_employee_kpi_results_period ON public.employee_kpi_results(period_year, period_month);

CREATE TRIGGER trg_employee_kpi_results_updated_at
  BEFORE UPDATE ON public.employee_kpi_results
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.employee_kpi_results ENABLE ROW LEVEL SECURITY;

-- SELECT: сотрудник видит своё, РОП — команды, owner/accountant — всё
CREATE POLICY "kpi_results_select_own"
  ON public.employee_kpi_results FOR SELECT
  USING (employee_id = public.get_my_employee_id());

CREATE POLICY "kpi_results_select_team"
  ON public.employee_kpi_results FOR SELECT
  USING (
    public.get_my_role() = 'rop'
    AND employee_id IN (
      SELECT id FROM public.employees
      WHERE department_id = (
        SELECT department_id FROM public.employees WHERE id = public.get_my_employee_id()
      ) AND deleted_at IS NULL
    )
  );

CREATE POLICY "kpi_results_select_admin"
  ON public.employee_kpi_results FOR SELECT
  USING (public.get_my_role() IN ('owner', 'accountant'));

-- INSERT: только owner и accountant
CREATE POLICY "kpi_results_insert"
  ON public.employee_kpi_results FOR INSERT
  WITH CHECK (public.get_my_role() IN ('owner', 'accountant'));

-- UPDATE: owner и accountant, ТОЛЬКО пока месяц не закрыт (USING).
-- WITH CHECK гарантирует, что через этот путь нельзя выставить is_closed = true.
-- Закрытие делается только через RPC close_kpi_month (SECURITY DEFINER).
CREATE POLICY "kpi_results_update_open"
  ON public.employee_kpi_results FOR UPDATE
  USING (
    is_closed = false
    AND public.get_my_role() IN ('owner', 'accountant')
  )
  WITH CHECK (
    is_closed = false
  );

-- DELETE: запрещён для всех
-- (нет DELETE-политики → RLS блокирует автоматически)


-- ────────────────────────────────────────────────────────────────
-- 6. employee_kpi_item_results — отметки выполнения KPI-пунктов
-- ────────────────────────────────────────────────────────────────

CREATE TABLE public.employee_kpi_item_results (
  id           UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  UUID     NOT NULL REFERENCES public.employees(id),
  kpi_item_id  UUID     NOT NULL REFERENCES public.kpi_items(id) ON DELETE CASCADE,
  period_year  SMALLINT NOT NULL,
  period_month SMALLINT NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  is_completed BOOLEAN  NOT NULL DEFAULT false,
  notes        TEXT,                                   -- кто отметил, примечание
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT employee_kpi_item_unique UNIQUE (employee_id, kpi_item_id, period_year, period_month)
);

CREATE INDEX idx_kpi_item_results_emp    ON public.employee_kpi_item_results(employee_id);
CREATE INDEX idx_kpi_item_results_period ON public.employee_kpi_item_results(period_year, period_month);

CREATE TRIGGER trg_kpi_item_results_updated_at
  BEFORE UPDATE ON public.employee_kpi_item_results
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.employee_kpi_item_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kpi_item_results_select_own"
  ON public.employee_kpi_item_results FOR SELECT
  USING (employee_id = public.get_my_employee_id());

CREATE POLICY "kpi_item_results_select_team"
  ON public.employee_kpi_item_results FOR SELECT
  USING (
    public.get_my_role() = 'rop'
    AND employee_id IN (
      SELECT id FROM public.employees
      WHERE department_id = (
        SELECT department_id FROM public.employees WHERE id = public.get_my_employee_id()
      ) AND deleted_at IS NULL
    )
  );

CREATE POLICY "kpi_item_results_select_admin"
  ON public.employee_kpi_item_results FOR SELECT
  USING (public.get_my_role() IN ('owner', 'accountant'));

-- INSERT/UPDATE: owner и accountant, только пока месяц не закрыт
CREATE POLICY "kpi_item_results_insert"
  ON public.employee_kpi_item_results FOR INSERT
  WITH CHECK (
    public.get_my_role() IN ('owner', 'accountant')
    AND NOT EXISTS (
      SELECT 1 FROM public.employee_kpi_results r
      WHERE r.employee_id = employee_kpi_item_results.employee_id
        AND r.period_year  = employee_kpi_item_results.period_year
        AND r.period_month = employee_kpi_item_results.period_month
        AND r.is_closed = true
    )
  );

CREATE POLICY "kpi_item_results_update"
  ON public.employee_kpi_item_results FOR UPDATE
  USING (
    public.get_my_role() IN ('owner', 'accountant')
    AND NOT EXISTS (
      SELECT 1 FROM public.employee_kpi_results r
      WHERE r.employee_id = employee_kpi_item_results.employee_id
        AND r.period_year  = employee_kpi_item_results.period_year
        AND r.period_month = employee_kpi_item_results.period_month
        AND r.is_closed = true
    )
  );

-- DELETE: owner только, только для незакрытых месяцев
CREATE POLICY "kpi_item_results_delete"
  ON public.employee_kpi_item_results FOR DELETE
  USING (
    public.get_my_role() = 'owner'
    AND NOT EXISTS (
      SELECT 1 FROM public.employee_kpi_results r
      WHERE r.employee_id = employee_kpi_item_results.employee_id
        AND r.period_year  = employee_kpi_item_results.period_year
        AND r.period_month = employee_kpi_item_results.period_month
        AND r.is_closed = true
    )
  );


-- ────────────────────────────────────────────────────────────────
-- 7. advance_payments — авансовые выплаты
-- ────────────────────────────────────────────────────────────────

CREATE TABLE public.advance_payments (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID          NOT NULL REFERENCES public.employees(id),
  amount      NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  date        DATE          NOT NULL,
  notes       TEXT,
  created_by  UUID REFERENCES public.employees(id),
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_advance_payments_emp  ON public.advance_payments(employee_id);
CREATE INDEX idx_advance_payments_date ON public.advance_payments(date);

ALTER TABLE public.advance_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "advance_payments_select_own"
  ON public.advance_payments FOR SELECT
  USING (employee_id = public.get_my_employee_id());

CREATE POLICY "advance_payments_select_team"
  ON public.advance_payments FOR SELECT
  USING (
    public.get_my_role() = 'rop'
    AND employee_id IN (
      SELECT id FROM public.employees
      WHERE department_id = (
        SELECT department_id FROM public.employees WHERE id = public.get_my_employee_id()
      ) AND deleted_at IS NULL
    )
  );

CREATE POLICY "advance_payments_select_admin"
  ON public.advance_payments FOR SELECT
  USING (public.get_my_role() IN ('owner', 'accountant'));

CREATE POLICY "advance_payments_insert"
  ON public.advance_payments FOR INSERT
  WITH CHECK (public.get_my_role() IN ('owner', 'accountant'));

CREATE POLICY "advance_payments_update"
  ON public.advance_payments FOR UPDATE
  USING (public.get_my_role() IN ('owner', 'accountant'));

CREATE POLICY "advance_payments_delete"
  ON public.advance_payments FOR DELETE
  USING (public.get_my_role() = 'owner');


-- ────────────────────────────────────────────────────────────────
-- 8. ALTER salaries: добавляем advance_amount
-- ────────────────────────────────────────────────────────────────

ALTER TABLE public.salaries
  ADD COLUMN IF NOT EXISTS advance_amount NUMERIC(12,2) NOT NULL DEFAULT 0;


-- ────────────────────────────────────────────────────────────────
-- 9. Функция recalculate_kpi_results
-- Пересчитывает все три компонента бонуса для сотрудника за месяц.
-- Вызывается: триггерами на daily_activity, sales_plan_weekly,
-- employee_kpi_item_results, а также напрямую из Server Actions.
-- Молча выходит, если месяц уже закрыт.
-- ────────────────────────────────────────────────────────────────

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
BEGIN
  -- Не пересчитываем закрытый месяц
  IF EXISTS (
    SELECT 1 FROM public.employee_kpi_results
    WHERE employee_id = p_employee_id
      AND period_year  = p_year
      AND period_month = p_month
      AND is_closed = true
  ) THEN
    RETURN;
  END IF;

  -- Находим конфиг KPI для роли сотрудника
  SELECT krs.id INTO v_role_setting_id
  FROM public.kpi_role_settings krs
  JOIN public.employees e ON e.role = krs.role_name
  WHERE e.id = p_employee_id
    AND krs.is_active = true
  LIMIT 1;

  IF v_role_setting_id IS NULL THEN
    -- Нет конфига KPI для этой роли — выходим без изменений
    RETURN;
  END IF;

  v_date_start := MAKE_DATE(p_year::INT, p_month::INT, 1);
  v_date_end   := (v_date_start + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

  -- 1. plan_completion_pct из sales_plan_weekly
  SELECT COALESCE(kpi_pct, 0)
  INTO v_plan_pct
  FROM public.sales_plan_weekly
  WHERE employee_id  = p_employee_id
    AND period_year  = p_year
    AND period_month = p_month;

  v_plan_pct := COALESCE(v_plan_pct, 0);

  -- 2. plan_bonus: находим подходящую ступень по %
  SELECT COALESCE(t.bonus_amount, 0)
  INTO v_plan_bonus
  FROM public.kpi_plan_tiers t
  WHERE t.role_setting_id = v_role_setting_id
    AND t.pct_from <= v_plan_pct
    AND (t.pct_to IS NULL OR v_plan_pct <= t.pct_to)
  ORDER BY t.pct_from DESC
  LIMIT 1;

  v_plan_bonus := COALESCE(v_plan_bonus, 0);

  -- 3. items_bonus: сумма выполненных именованных пунктов
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

  -- 4. daily_bonus: для каждого дня в daily_activity ищем подходящий тир
  SELECT COALESCE(SUM(
    (SELECT COALESCE(t.bonus_amount, 0)
     FROM public.kpi_daily_tiers t
     WHERE t.role_setting_id = v_role_setting_id
       AND t.revenue_from <= COALESCE(da.revenue_fact, 0)
       AND (t.revenue_to IS NULL OR COALESCE(da.revenue_fact, 0) < t.revenue_to)
     ORDER BY t.revenue_from DESC
     LIMIT 1)
  ), 0)
  INTO v_daily_bonus
  FROM public.daily_activity da
  WHERE da.employee_id = p_employee_id
    AND da.date BETWEEN v_date_start AND v_date_end;

  v_daily_bonus := COALESCE(v_daily_bonus, 0);

  -- 5. Upsert в employee_kpi_results (только незакрытые строки обновляются)
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

GRANT EXECUTE ON FUNCTION public.recalculate_kpi_results(UUID, SMALLINT, SMALLINT) TO authenticated;


-- ────────────────────────────────────────────────────────────────
-- 10. Функция close_kpi_month
-- SECURITY DEFINER — единственный способ выставить is_closed = true.
-- Доступна только владельцу и бухгалтеру (проверяется внутри).
-- ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.close_kpi_month(
  p_employee_id UUID,
  p_year        SMALLINT,
  p_month       SMALLINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_role TEXT;
  v_closer_id   UUID;
BEGIN
  -- Проверяем роль вызывающего
  SELECT public.get_my_role() INTO v_caller_role;
  IF v_caller_role NOT IN ('owner', 'accountant') THEN
    RAISE EXCEPTION 'close_kpi_month: недостаточно прав (требуется owner или accountant)';
  END IF;

  SELECT public.get_my_employee_id() INTO v_closer_id;

  -- Пересчитываем финальный снэпшот перед закрытием
  PERFORM public.recalculate_kpi_results(p_employee_id, p_year, p_month);

  -- Создаём запись, если её ещё нет, и закрываем
  INSERT INTO public.employee_kpi_results (
    employee_id, period_year, period_month,
    plan_completion_pct, plan_bonus, items_bonus, daily_bonus, total_bonus,
    is_closed, closed_at, closed_by
  )
  VALUES (
    p_employee_id, p_year, p_month,
    0, 0, 0, 0, 0,
    true, NOW(), v_closer_id
  )
  ON CONFLICT (employee_id, period_year, period_month)
  DO UPDATE SET
    is_closed  = true,
    closed_at  = NOW(),
    closed_by  = v_closer_id,
    updated_at = NOW();
END;
$$;

-- Доступна всем авторизованным — проверка роли внутри функции
GRANT EXECUTE ON FUNCTION public.close_kpi_month(UUID, SMALLINT, SMALLINT) TO authenticated;


-- ────────────────────────────────────────────────────────────────
-- 11. Триггерная функция для автоматического пересчёта
-- ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_recalculate_kpi_results()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_employee_id UUID;
  v_year        SMALLINT;
  v_month       SMALLINT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_employee_id := OLD.employee_id;
    v_year        := EXTRACT(YEAR  FROM OLD.date)::SMALLINT;
    v_month       := EXTRACT(MONTH FROM OLD.date)::SMALLINT;
  ELSE
    v_employee_id := NEW.employee_id;
    v_year        := EXTRACT(YEAR  FROM NEW.date)::SMALLINT;
    v_month       := EXTRACT(MONTH FROM NEW.date)::SMALLINT;
  END IF;

  PERFORM public.recalculate_kpi_results(v_employee_id, v_year, v_month);

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

-- Аналог для sales_plan_weekly (нет поля date — есть period_year/period_month)
CREATE OR REPLACE FUNCTION public.trg_recalculate_kpi_results_period()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_employee_id UUID;
  v_year        SMALLINT;
  v_month       SMALLINT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_employee_id := OLD.employee_id;
    v_year        := OLD.period_year;
    v_month       := OLD.period_month;
  ELSE
    v_employee_id := NEW.employee_id;
    v_year        := NEW.period_year;
    v_month       := NEW.period_month;
  END IF;

  PERFORM public.recalculate_kpi_results(v_employee_id, v_year, v_month);

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

-- Аналог для employee_kpi_item_results (тоже period_year/period_month)
CREATE OR REPLACE FUNCTION public.trg_recalculate_kpi_results_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_employee_id UUID;
  v_year        SMALLINT;
  v_month       SMALLINT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_employee_id := OLD.employee_id;
    v_year        := OLD.period_year;
    v_month       := OLD.period_month;
  ELSE
    v_employee_id := NEW.employee_id;
    v_year        := NEW.period_year;
    v_month       := NEW.period_month;
  END IF;

  PERFORM public.recalculate_kpi_results(v_employee_id, v_year, v_month);

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;


-- ────────────────────────────────────────────────────────────────
-- 12. Триггеры
-- ────────────────────────────────────────────────────────────────

-- daily_activity → recalculate_kpi_results
CREATE TRIGGER trg_daily_activity_kpi_results
  AFTER INSERT OR UPDATE OR DELETE ON public.daily_activity
  FOR EACH ROW EXECUTE FUNCTION public.trg_recalculate_kpi_results();

-- sales_plan_weekly → recalculate_kpi_results (kpi_pct обновился)
CREATE TRIGGER trg_sales_plan_weekly_kpi_results
  AFTER INSERT OR UPDATE OR DELETE ON public.sales_plan_weekly
  FOR EACH ROW EXECUTE FUNCTION public.trg_recalculate_kpi_results_period();

-- employee_kpi_item_results → recalculate_kpi_results (items_bonus обновился)
CREATE TRIGGER trg_kpi_item_results_recalc
  AFTER INSERT OR UPDATE OR DELETE ON public.employee_kpi_item_results
  FOR EACH ROW EXECUTE FUNCTION public.trg_recalculate_kpi_results_item();

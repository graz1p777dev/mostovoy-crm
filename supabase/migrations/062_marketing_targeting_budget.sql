-- ─── 062: экран «Таргет» — бюджет в $, реестр пополнений, сверка кабинет↔ЛМ ─────
--
-- Реальный процесс владельца: рекламный счёт пополняется нерегулярно (раз в 1–3 недели),
-- сомы конвертируются в доллары по КУРСУ ДНЯ (каждый раз разный, с налогами/комиссией).
-- Поэтому:
--   • дневной бюджет таргетолога вводится в $ (budget_usd);
--   • отдельный реестр пополнений marketing_topups хранит дату, сумму $, реально
--     списанную сумму в сомах и авто-курс (сом ÷ $);
--   • сомовый эквивалент дневного бюджета (budget, сом) считается сервером по курсу
--     ПОСЛЕДНЕГО пополнения на дату записи и замораживается в строке — так CPI/ДРР
--     идут по реальным затратам и сходятся с финансами.
--   • budget (сом) сохранён как раньше → существующий экран таргетолога не ломается.
-- Плюс новое поле lm_appeals — обращения, ФАКТИЧЕСКИ дошедшие до менеджера (сверка с кабинетом).

-- ── 1. Новые поля дневных данных таргета ──────────────────────────────────────
ALTER TABLE public.marketing_daily_data
  ADD COLUMN IF NOT EXISTS budget_usd numeric  NOT NULL DEFAULT 0,  -- бюджет за день, $
  ADD COLUMN IF NOT EXISTS lm_appeals integer  NOT NULL DEFAULT 0;  -- обращения, дошедшие до ЛМ
-- (budget numeric остаётся = сомовый эквивалент реальных затрат)

-- ── 2. Реестр пополнений рекламного счёта ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.marketing_topups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id),  -- таргетолог/счёт
  date        date NOT NULL,                                   -- дата пополнения
  amount_usd  numeric NOT NULL CHECK (amount_usd > 0),         -- зачислено на счёт, $
  amount_som  numeric NOT NULL CHECK (amount_som > 0),         -- реально списано, сом (с налогами/комиссией)
  -- курс сом за $1 — авто из реально списанной суммы (single source of truth)
  rate        numeric GENERATED ALWAYS AS (amount_som / amount_usd) STORED,
  note        text,
  created_by  uuid REFERENCES public.employees(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE INDEX IF NOT EXISTS idx_marketing_topups_emp_date
  ON public.marketing_topups (employee_id, date) WHERE deleted_at IS NULL;

REVOKE ALL ON TABLE public.marketing_topups FROM anon, authenticated;
GRANT SELECT ON TABLE public.marketing_topups TO authenticated;
GRANT ALL    ON TABLE public.marketing_topups TO service_role;

ALTER TABLE public.marketing_topups ENABLE ROW LEVEL SECURITY;
-- Per-employee permissions-driven по ресурсу marketing (как marketing_daily_data)
DROP POLICY IF EXISTS marketing_topups_select_by_perm ON public.marketing_topups;
CREATE POLICY marketing_topups_select_by_perm ON public.marketing_topups FOR SELECT TO authenticated
USING (
  deleted_at IS NULL AND (
       (SELECT public._my_perm_scope('marketing')) = 'all'
    OR ((SELECT public._my_perm_scope('marketing')) = 'team' AND employee_id IN (SELECT public._my_dept_employee_ids()))
    OR ((SELECT public._my_perm_scope('marketing')) = 'own'  AND employee_id = (SELECT public.get_my_employee_id()))
  )
);

-- ── 3. save_marketing_daily — расширена: budget (сом) + budget_usd + lm_appeals ─
-- Сигнатура меняется (10 → 12 арг) → DROP старой версии, затем CREATE новой.
-- Тело идентично 054, кроме проброса budget_usd и lm_appeals в захват old/INSERT/UPDATE/аудит.
DROP FUNCTION IF EXISTS public.save_marketing_daily(uuid, date, integer, integer, integer, numeric, integer, uuid, text, uuid);

CREATE OR REPLACE FUNCTION public.save_marketing_daily(
  p_employee_id         uuid,
  p_date                date,
  p_active_campaigns    integer,
  p_reach               integer,
  p_clicks              integer,
  p_budget              numeric,   -- сомовый эквивалент (рассчитан сервером по курсу последнего пополнения)
  p_budget_usd          numeric,   -- введённый бюджет за день, $
  p_ad_appeals          integer,
  p_lm_appeals          integer,
  p_actor_employee_id   uuid,
  p_actor_scope         text,
  p_actor_department_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_role text; v_status text; v_deleted_at timestamptz; v_dept uuid;
  v_id uuid; v_existed boolean; v_old jsonb;
BEGIN
  SELECT role, status, deleted_at, department_id
    INTO v_role, v_status, v_deleted_at, v_dept
  FROM public.employees WHERE id = p_employee_id FOR UPDATE;
  IF NOT FOUND OR v_deleted_at IS NOT NULL OR v_status = 'archived' OR v_role <> 'targetolog' THEN
    RAISE EXCEPTION 'target_not_targetolog';
  END IF;

  IF NOT public._fact_scope_ok(p_employee_id, v_dept, p_actor_employee_id, p_actor_scope, p_actor_department_id) THEN
    RAISE EXCEPTION 'scope_violation';
  END IF;
  PERFORM public._assert_actor_active(p_actor_employee_id);

  SELECT id, jsonb_build_object('active_campaigns', active_campaigns, 'reach', reach,
                                'clicks', clicks, 'budget', budget, 'budget_usd', budget_usd,
                                'ad_appeals', ad_appeals, 'lm_appeals', lm_appeals)
    INTO v_id, v_old
  FROM public.marketing_daily_data WHERE employee_id = p_employee_id AND date = p_date FOR UPDATE;
  v_existed := FOUND;

  IF v_existed THEN
    UPDATE public.marketing_daily_data
       SET active_campaigns = p_active_campaigns, reach = p_reach, clicks = p_clicks,
           budget = p_budget, budget_usd = p_budget_usd,
           ad_appeals = p_ad_appeals, lm_appeals = p_lm_appeals, updated_at = now()
     WHERE id = v_id;
  ELSE
    INSERT INTO public.marketing_daily_data
      (employee_id, date, active_campaigns, reach, clicks, budget, budget_usd, ad_appeals, lm_appeals)
    VALUES (p_employee_id, p_date, p_active_campaigns, p_reach, p_clicks, p_budget, p_budget_usd, p_ad_appeals, p_lm_appeals)
    RETURNING id INTO v_id;
  END IF;

  INSERT INTO public.audit_logs (employee_id, action, resource_type, resource_id, old_data, new_data)
  VALUES (
    p_actor_employee_id,
    CASE WHEN v_existed THEN 'update' ELSE 'create' END,
    'marketing_daily_data', v_id,
    v_old,
    jsonb_build_object('event', 'marketing_daily_edit', 'employee_id', p_employee_id, 'date', p_date,
      'active_campaigns', p_active_campaigns, 'reach', p_reach, 'clicks', p_clicks,
      'budget', p_budget, 'budget_usd', p_budget_usd, 'ad_appeals', p_ad_appeals, 'lm_appeals', p_lm_appeals)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.save_marketing_daily(uuid, date, integer, integer, integer, numeric, numeric, integer, integer, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_marketing_daily(uuid, date, integer, integer, integer, numeric, numeric, integer, integer, uuid, text, uuid) TO service_role;

-- ─── 052: транзакционная RPC ручной правки факта МП (Блокер Codex #1a) ─────────
--
-- saveMpDailyFact (Server Action) проверял только isManager()+can(edit), но НЕ scope.
-- РОП со scope='team' мог записать факт сотруднику ЧУЖОГО отдела и вообще любому
-- employee UUID (не обязательно менеджеру продаж). revenue_fact участвует в KPI и
-- бонусах — это денежная операция, поэтому охват должен проверяться жёстко.
--
-- По образцу консультаций (041): охват перепроверяется ВНУТРИ транзакции RPC, после
-- чтения роли и отдела цели — закрывает TOCTOU между pre-check в Node и записью.
-- Node дополнительно делает pre-check (быстрый отказ), но источник истины — здесь.
--
-- Пишем ТОЛЬКО fv_fact/sales_fact/revenue_fact. Колонки walk_in_* (049) и зона ЛМ
-- (appeals/leads/nv_*) на конфликте НЕ трогаются — их нет в списке DO UPDATE, при
-- вставке новой строки они остаются NULL (DEFAULT). NULL в fv/sales/revenue = «нет
-- ручной правки, факт считается из консультаций» — согласуется с resolveDayMetric.
--
-- Переиспользуем public._manager_in_scope(uuid,uuid,text,uuid) из 041:
--   scope='all' → всегда true; 'own' → цель = актор; 'team' → цель или её отдел = отдел актора.

CREATE OR REPLACE FUNCTION public.save_mp_daily_fact(
  p_employee_id         uuid,
  p_date                date,
  p_fv                  integer,
  p_sales               integer,
  p_revenue             numeric,
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
  v_role       text;
  v_deleted_at timestamptz;
BEGIN
  -- Цель обязана быть активным менеджером продаж (не произвольный UUID и не иная роль).
  SELECT role, deleted_at INTO v_role, v_deleted_at
  FROM public.employees WHERE id = p_employee_id;
  IF NOT FOUND OR v_deleted_at IS NOT NULL OR v_role <> 'mp' THEN
    RAISE EXCEPTION 'target_not_mp';
  END IF;

  -- Повторная проверка охвата внутри транзакции (отдел цели читается здесь же).
  IF NOT public._manager_in_scope(p_employee_id, p_actor_employee_id, p_actor_scope, p_actor_department_id) THEN
    RAISE EXCEPTION 'scope_violation';
  END IF;

  INSERT INTO public.daily_activity (employee_id, date, fv_fact, sales_fact, revenue_fact)
  VALUES (p_employee_id, p_date, p_fv, p_sales, p_revenue)
  ON CONFLICT (employee_id, date) DO UPDATE SET
    fv_fact      = EXCLUDED.fv_fact,
    sales_fact   = EXCLUDED.sales_fact,
    revenue_fact = EXCLUDED.revenue_fact,
    updated_at   = now();
END;
$$;

REVOKE ALL ON FUNCTION public.save_mp_daily_fact(uuid, date, integer, integer, numeric, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_mp_daily_fact(uuid, date, integer, integer, numeric, uuid, text, uuid) TO service_role;

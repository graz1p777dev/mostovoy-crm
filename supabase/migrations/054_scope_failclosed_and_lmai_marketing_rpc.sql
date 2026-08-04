-- ─── 054: fail-closed охват + атомарные RPC правки факта ЛМ и таргетолога ──────
--
-- Три задачи:
--  A. NOTE #3 — save_mp_daily_fact (053) fail-closed при NULL-аргументах.
--     Раньше `IF NOT (<predicate>)`: при NULL-аргументе predicate = NULL, `NOT NULL` = NULL,
--     ветка не срабатывала → запись проходила (fail-OPEN). Теперь охват считается общим
--     хелпером _fact_scope_ok, который COALESCE-ит NULL в false → отказ. (NOTE #4 — ниже.)
--  B/C. Закрытие BOLA в my-decomposition.ts / marketing-decomposition.ts: денежная/фактовая
--     запись выносится в транзакционные RPC (как 053) — блокировка цели FOR UPDATE, проверка
--     РОЛИ цели (lmai / targetolog, не любой UUID) и активности, охват fail-closed, аудит.
--
-- NOTE #4 (оценено): полную сериализацию актора не делаем. Блокировка ВТОРОЙ строки
-- (актор + цель) даёт риск дедлока при встречных вызовах, а переопределение scope внутри БД
-- форкнуло бы источник прав (authz.ts/ permissions). Вместо этого — НЕблокирующая
-- перепроверка активности актора внутри RPC: закрывает уже закоммиченное увольнение/
-- архивацию руководителя. Остаточное окно (смена роли активного актора в под-миллисекундном
-- интервале getActor()→RPC) принято как пренебрежимо малое.

-- ── Хелпер охвата: NULL-safe (любой NULL-аргумент → false = отказ) ────────────
-- Работает по ПЕРЕДАННОМУ отделу цели (строка уже прочитана под FOR UPDATE), поэтому
-- department_id повторно не читается (в отличие от _manager_in_scope) — это и закрывает TOCTOU.
CREATE OR REPLACE FUNCTION public._fact_scope_ok(
  p_target_emp  uuid,
  p_target_dept uuid,
  p_actor_emp   uuid,
  p_scope       text,
  p_actor_dept  uuid
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
       p_scope = 'all'
    OR (p_scope = 'own'  AND p_target_emp = p_actor_emp)
    OR (p_scope = 'team' AND (
           p_target_emp = p_actor_emp
        OR (p_target_dept IS NOT NULL AND p_target_dept = p_actor_dept)
       )),
    false
  );
$$;
REVOKE ALL ON FUNCTION public._fact_scope_ok(uuid, uuid, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._fact_scope_ok(uuid, uuid, uuid, text, uuid) TO service_role;

-- ── Хелпер: актор всё ещё активен (NOTE #4, неблокирующая перепроверка) ────────
CREATE OR REPLACE FUNCTION public._assert_actor_active(p_actor_emp uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  PERFORM 1 FROM public.employees
  WHERE id = p_actor_emp AND deleted_at IS NULL AND status IS DISTINCT FROM 'archived';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'actor_inactive';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public._assert_actor_active(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._assert_actor_active(uuid) TO service_role;

-- ── A. save_mp_daily_fact — fail-closed охват + перепроверка актора (NOTE #3/#4) ─
-- Тело идентично 053, кроме: (1) охват через _fact_scope_ok (NULL→отказ);
-- (2) добавлена _assert_actor_active. FOR UPDATE цели, аудит, created_by — как в 053.
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
  v_role text; v_status text; v_deleted_at timestamptz; v_dept uuid;
  v_da_id uuid; v_existed boolean;
  v_old_fv integer; v_old_sales integer; v_old_rev numeric;
BEGIN
  SELECT role, status, deleted_at, department_id
    INTO v_role, v_status, v_deleted_at, v_dept
  FROM public.employees WHERE id = p_employee_id FOR UPDATE;
  IF NOT FOUND OR v_deleted_at IS NOT NULL OR v_status = 'archived' OR v_role <> 'mp' THEN
    RAISE EXCEPTION 'target_not_mp';
  END IF;

  IF NOT public._fact_scope_ok(p_employee_id, v_dept, p_actor_employee_id, p_actor_scope, p_actor_department_id) THEN
    RAISE EXCEPTION 'scope_violation';
  END IF;
  PERFORM public._assert_actor_active(p_actor_employee_id);

  SELECT id, fv_fact, sales_fact, revenue_fact
    INTO v_da_id, v_old_fv, v_old_sales, v_old_rev
  FROM public.daily_activity WHERE employee_id = p_employee_id AND date = p_date FOR UPDATE;
  v_existed := FOUND;

  IF v_existed THEN
    UPDATE public.daily_activity
       SET fv_fact = p_fv, sales_fact = p_sales, revenue_fact = p_revenue, updated_at = now()
     WHERE id = v_da_id;
  ELSE
    INSERT INTO public.daily_activity (employee_id, date, fv_fact, sales_fact, revenue_fact, created_by)
    VALUES (p_employee_id, p_date, p_fv, p_sales, p_revenue, p_actor_employee_id)
    RETURNING id INTO v_da_id;
  END IF;

  INSERT INTO public.audit_logs (employee_id, action, resource_type, resource_id, old_data, new_data)
  VALUES (
    p_actor_employee_id,
    CASE WHEN v_existed THEN 'update' ELSE 'create' END,
    'daily_activity', v_da_id,
    jsonb_build_object('employee_id', p_employee_id, 'date', p_date,
      'fv_fact', v_old_fv, 'sales_fact', v_old_sales, 'revenue_fact', v_old_rev),
    jsonb_build_object('event', 'mp_daily_fact_edit', 'employee_id', p_employee_id, 'date', p_date,
      'fv_fact', p_fv, 'sales_fact', p_sales, 'revenue_fact', p_revenue)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.save_mp_daily_fact(uuid, date, integer, integer, numeric, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_mp_daily_fact(uuid, date, integer, integer, numeric, uuid, text, uuid) TO service_role;

-- ── B. save_lmai_daily_entry — правка appeals/leads/nv ЛМ (BOLA my-decomposition) ─
-- Цель обязана быть активным лид-менеджером (lmai). FOR UPDATE + fail-closed охват +
-- перепроверка актора + created_by на INSERT + атомарный аудит.
CREATE OR REPLACE FUNCTION public.save_lmai_daily_entry(
  p_employee_id         uuid,
  p_date                date,
  p_appeals             integer,
  p_leads               integer,
  p_nv                  integer,
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
  v_da_id uuid; v_existed boolean;
  v_old_appeals integer; v_old_leads integer; v_old_nv integer;
BEGIN
  SELECT role, status, deleted_at, department_id
    INTO v_role, v_status, v_deleted_at, v_dept
  FROM public.employees WHERE id = p_employee_id FOR UPDATE;
  IF NOT FOUND OR v_deleted_at IS NOT NULL OR v_status = 'archived' OR v_role <> 'lmai' THEN
    RAISE EXCEPTION 'target_not_lmai';
  END IF;

  IF NOT public._fact_scope_ok(p_employee_id, v_dept, p_actor_employee_id, p_actor_scope, p_actor_department_id) THEN
    RAISE EXCEPTION 'scope_violation';
  END IF;
  PERFORM public._assert_actor_active(p_actor_employee_id);

  SELECT id, appeals_fact, leads_fact, nv_fact
    INTO v_da_id, v_old_appeals, v_old_leads, v_old_nv
  FROM public.daily_activity WHERE employee_id = p_employee_id AND date = p_date FOR UPDATE;
  v_existed := FOUND;

  IF v_existed THEN
    UPDATE public.daily_activity
       SET appeals_fact = p_appeals, leads_fact = p_leads, nv_fact = p_nv, updated_at = now()
     WHERE id = v_da_id;
  ELSE
    INSERT INTO public.daily_activity (employee_id, date, appeals_fact, leads_fact, nv_fact, created_by)
    VALUES (p_employee_id, p_date, p_appeals, p_leads, p_nv, p_actor_employee_id)
    RETURNING id INTO v_da_id;
  END IF;

  INSERT INTO public.audit_logs (employee_id, action, resource_type, resource_id, old_data, new_data)
  VALUES (
    p_actor_employee_id,
    CASE WHEN v_existed THEN 'update' ELSE 'create' END,
    'daily_activity', v_da_id,
    jsonb_build_object('employee_id', p_employee_id, 'date', p_date,
      'appeals_fact', v_old_appeals, 'leads_fact', v_old_leads, 'nv_fact', v_old_nv),
    jsonb_build_object('event', 'lmai_daily_entry_edit', 'employee_id', p_employee_id, 'date', p_date,
      'appeals_fact', p_appeals, 'leads_fact', p_leads, 'nv_fact', p_nv)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.save_lmai_daily_entry(uuid, date, integer, integer, integer, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_lmai_daily_entry(uuid, date, integer, integer, integer, uuid, text, uuid) TO service_role;

-- ── C. save_marketing_daily — правка дневных данных таргетолога (BOLA marketing) ─
-- Цель обязана быть активным таргетологом (targetolog). marketing_daily_data не имеет
-- created_by — не пишем. FOR UPDATE + fail-closed охват + перепроверка актора + аудит.
CREATE OR REPLACE FUNCTION public.save_marketing_daily(
  p_employee_id         uuid,
  p_date                date,
  p_active_campaigns    integer,
  p_reach               integer,
  p_clicks              integer,
  p_budget              numeric,
  p_ad_appeals          integer,
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
                                'clicks', clicks, 'budget', budget, 'ad_appeals', ad_appeals)
    INTO v_id, v_old
  FROM public.marketing_daily_data WHERE employee_id = p_employee_id AND date = p_date FOR UPDATE;
  v_existed := FOUND;

  IF v_existed THEN
    UPDATE public.marketing_daily_data
       SET active_campaigns = p_active_campaigns, reach = p_reach, clicks = p_clicks,
           budget = p_budget, ad_appeals = p_ad_appeals, updated_at = now()
     WHERE id = v_id;
  ELSE
    INSERT INTO public.marketing_daily_data (employee_id, date, active_campaigns, reach, clicks, budget, ad_appeals)
    VALUES (p_employee_id, p_date, p_active_campaigns, p_reach, p_clicks, p_budget, p_ad_appeals)
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
      'budget', p_budget, 'ad_appeals', p_ad_appeals)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.save_marketing_daily(uuid, date, integer, integer, integer, numeric, integer, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_marketing_daily(uuid, date, integer, integer, integer, numeric, integer, uuid, text, uuid) TO service_role;

-- ─── 053: save_mp_daily_fact — блокировка цели (FOR UPDATE) + атомарный аудит ──
--
-- Закрывает два блокера Codex [P1] к RPC из 052 (052 НЕ переписываем — она уже
-- применена; здесь только CREATE OR REPLACE тела функции, сигнатура та же).
--
-- БЛОКЕР 1 [P1] — TOCTOU. 052 читала роль/статус/отдел цели обычным SELECT, затем
-- проверяла охват, затем писала — без блокировки. Параллельная транзакция могла сменить
-- роль/отдел цели между проверкой и записью, и revenue_fact (влияет на % плана и бонусы)
-- ушёл бы не-МП или вне охвата. Решение (паттерн 041/046-047):
--   • роль, статус, deleted_at, department_id читаются ОДНИМ SELECT ... FOR UPDATE;
--   • проверки роли/активности/охвата — по ЗАФИКСИРОВАННЫМ значениям (не перечитываем);
--   • блокировка строки employees держится до COMMIT — конкурентные правки факта того же
--     сотрудника сериализуются на этой блокировке, роль/отдел не изменятся под нами.
--   Поэтому охват проверяем INLINE по v_dept, а НЕ через _manager_in_scope() — тот
--   перечитал бы department_id из employees и вернул бы TOCTOU-щель обратно.
--
-- БЛОКЕР 2 [P1] — денежные правки не аудировались (created_by=NULL, UPDATE без следа).
-- Решение — в той же транзакции:
--   • created_by заполняется автором на INSERT новой строки;
--   • пишем запись в audit_logs (общий механизм; action из CHECK-списка create/update)
--     с old→new по fv/sales/revenue, автором, сотрудником и датой;
--   • аудит в ТОЙ ЖЕ транзакции — ошибка его вставки откатывает и правку факта.

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
  v_status     text;
  v_deleted_at timestamptz;
  v_dept       uuid;
  v_da_id      uuid;
  v_existed    boolean;
  v_old_fv     integer;
  v_old_sales  integer;
  v_old_rev    numeric;
BEGIN
  -- 1. Блокируем строку цели и читаем всё нужное ОДНИМ снимком (закрывает TOCTOU).
  SELECT role, status, deleted_at, department_id
    INTO v_role, v_status, v_deleted_at, v_dept
  FROM public.employees
  WHERE id = p_employee_id
  FOR UPDATE;

  -- 2. Роль/активность — по зафиксированным значениям. Цель обязана быть активным МП.
  IF NOT FOUND OR v_deleted_at IS NOT NULL OR v_status = 'archived' OR v_role <> 'mp' THEN
    RAISE EXCEPTION 'target_not_mp';
  END IF;

  -- 3. Охват — INLINE по зафиксированному v_dept (НЕ через _manager_in_scope, чтобы не
  --    перечитывать отдел). Логика идентична: all → всегда; own → цель=актор;
  --    team → цель=актор ИЛИ отдел цели = отдел актора.
  IF NOT (
       p_actor_scope = 'all'
    OR (p_actor_scope = 'own'  AND p_employee_id = p_actor_employee_id)
    OR (p_actor_scope = 'team' AND (
           p_employee_id = p_actor_employee_id
        OR (v_dept IS NOT NULL AND v_dept = p_actor_department_id)
       ))
  ) THEN
    RAISE EXCEPTION 'scope_violation';
  END IF;

  -- 4. Прежние значения факта (для аудита old→new). Блокируем строку факта, если она есть.
  SELECT id, fv_fact, sales_fact, revenue_fact
    INTO v_da_id, v_old_fv, v_old_sales, v_old_rev
  FROM public.daily_activity
  WHERE employee_id = p_employee_id AND date = p_date
  FOR UPDATE;
  v_existed := FOUND;

  -- 5. Запись факта. На INSERT фиксируем автора в created_by; на UPDATE created_by не
  --    трогаем (это исходный создатель строки). walk_in_* и зона ЛМ не затрагиваются.
  IF v_existed THEN
    UPDATE public.daily_activity
       SET fv_fact = p_fv, sales_fact = p_sales, revenue_fact = p_revenue, updated_at = now()
     WHERE id = v_da_id;
  ELSE
    INSERT INTO public.daily_activity (employee_id, date, fv_fact, sales_fact, revenue_fact, created_by)
    VALUES (p_employee_id, p_date, p_fv, p_sales, p_revenue, p_actor_employee_id)
    RETURNING id INTO v_da_id;
  END IF;

  -- 6. Аудит в ТОЙ ЖЕ транзакции (ошибка вставки откатит правку факта). employee_id в
  --    audit_logs = АКТОР (как в dismiss_employee/046). Конкретика — в old_data/new_data.
  INSERT INTO public.audit_logs (employee_id, action, resource_type, resource_id, old_data, new_data)
  VALUES (
    p_actor_employee_id,
    CASE WHEN v_existed THEN 'update' ELSE 'create' END,
    'daily_activity',
    v_da_id,
    jsonb_build_object(
      'employee_id', p_employee_id, 'date', p_date,
      'fv_fact', v_old_fv, 'sales_fact', v_old_sales, 'revenue_fact', v_old_rev
    ),
    jsonb_build_object(
      'event', 'mp_daily_fact_edit',
      'employee_id', p_employee_id, 'date', p_date,
      'fv_fact', p_fv, 'sales_fact', p_sales, 'revenue_fact', p_revenue
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_mp_daily_fact(uuid, date, integer, integer, numeric, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_mp_daily_fact(uuid, date, integer, integer, numeric, uuid, text, uuid) TO service_role;

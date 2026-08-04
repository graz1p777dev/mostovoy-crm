-- ── Системная зачистка авторизации: RLS-hardening + ужесточение RPC ────────────
--
-- Блокер Codex #3 (маркетинг): SELECT-policy на marketing_* была USING(true) —
--   любой authenticated читал все маркетинговые данные в обход прав.
-- Блокер #9 (аудит): audit_logs INSERT для authenticated был WITH CHECK true —
--   можно подделать записи аудита. Все легитимные записи идут через service_role (admin).
-- Плюс: RPC create_role_with_permissions проверяет ТОЧНОЕ множество 16 ресурсов;
--   _manager_in_scope не даёт назначить архивного/удалённого сотрудника.

-- ── #3: marketing SELECT — по роли/охвату (зеркалит INSERT/UPDATE policies) ────
DROP POLICY IF EXISTS marketing_daily_select ON public.marketing_daily_data;
CREATE POLICY marketing_daily_select ON public.marketing_daily_data
  FOR SELECT TO authenticated
  USING (
    employee_id = public.get_my_employee_id()
    OR public.get_my_role() = 'owner'
    OR public.get_my_permission_level() = 'department_head'
  );

DROP POLICY IF EXISTS marketing_plans_select ON public.marketing_plans;
CREATE POLICY marketing_plans_select ON public.marketing_plans
  FOR SELECT TO authenticated
  USING (
    public.get_my_role() IN ('owner', 'targetolog')
    OR public.get_my_permission_level() = 'department_head'
  );

-- ── #9: audit_logs INSERT — только service_role (Server Action через admin) ────
-- auth.ts пишет impersonation-лог через admin-клиент (service_role обходит RLS),
-- поэтому запрет authenticated-INSERT легитимные записи не ломает, но закрывает подделку.
DROP POLICY IF EXISTS audit_logs_insert_authenticated ON public.audit_logs;
CREATE POLICY audit_logs_insert_no_client ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (false);

-- ── #8: create_role_with_permissions — точное множество 16 ресурсов ───────────
CREATE OR REPLACE FUNCTION public.create_role_with_permissions(
  p_name             text,
  p_label            text,
  p_permission_level text,
  p_permissions      jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_role_id  uuid;
  v_missing  int;
  v_extra    int;
  v_expected text[] := ARRAY[
    'dashboard','consultations','decomposition','salaries','finances','marketing',
    'employees','calendar','attendance','tasks','notifications','documents',
    'investors','kpi_settings','settings','integrations'
  ];
BEGIN
  INSERT INTO public.roles (name, label, permission_level, is_system)
  VALUES (p_name, p_label, p_permission_level, false)
  RETURNING id INTO v_role_id;

  INSERT INTO public.permissions (role_id, resource, can_view, can_create, can_edit, can_delete, scope)
  SELECT
    v_role_id, e->>'resource',
    COALESCE((e->>'can_view')::boolean, false),
    COALESCE((e->>'can_create')::boolean, false),
    COALESCE((e->>'can_edit')::boolean, false),
    CASE WHEN e->>'resource' = 'consultations' THEN false ELSE COALESCE((e->>'can_delete')::boolean, false) END,
    COALESCE(e->>'scope', 'own')
  FROM jsonb_array_elements(p_permissions) e
  WHERE e->>'resource' = ANY(v_expected)   -- игнорируем посторонние ресурсы
  ON CONFLICT (role_id, resource) DO NOTHING;

  -- Проверяем ТОЧНОЕ множество: ни одного пропущенного из 16, ни одного лишнего.
  SELECT count(*) INTO v_missing
  FROM unnest(v_expected) req
  WHERE NOT EXISTS (SELECT 1 FROM public.permissions p WHERE p.role_id = v_role_id AND p.resource = req);

  SELECT count(*) INTO v_extra
  FROM public.permissions p
  WHERE p.role_id = v_role_id AND NOT (p.resource = ANY(v_expected));

  IF v_missing <> 0 OR v_extra <> 0 THEN
    RAISE EXCEPTION 'incomplete_permissions_seed: missing=%, extra=%', v_missing, v_extra;
  END IF;

  RETURN v_role_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_role_with_permissions(text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_role_with_permissions(text, text, text, jsonb) TO service_role;

-- ── #7: _manager_in_scope — целевой сотрудник должен быть активным ────────────
CREATE OR REPLACE FUNCTION public._manager_in_scope(
  p_manager_id  uuid,
  p_actor_emp   uuid,
  p_scope       text,
  p_actor_dept  uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_dept uuid; v_ok boolean;
BEGIN
  -- Назначаемый (если задан) обязан быть активным сотрудником — нельзя повесить запись
  -- на удалённого/архивного. Пустой manager (NULL) допустим только для scope='all'.
  IF p_manager_id IS NOT NULL THEN
    SELECT (deleted_at IS NULL AND status <> 'archived') INTO v_ok
    FROM public.employees WHERE id = p_manager_id;
    IF v_ok IS DISTINCT FROM true THEN RETURN false; END IF;
  END IF;

  IF p_scope = 'all' THEN RETURN true; END IF;
  IF p_manager_id IS NULL THEN RETURN false; END IF;
  IF p_scope = 'own' THEN RETURN p_manager_id = p_actor_emp; END IF;
  IF p_scope = 'team' THEN
    IF p_manager_id = p_actor_emp THEN RETURN true; END IF;
    SELECT department_id INTO v_dept FROM public.employees WHERE id = p_manager_id;
    RETURN v_dept IS NOT NULL AND v_dept = p_actor_dept;
  END IF;
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION public._manager_in_scope(uuid, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._manager_in_scope(uuid, uuid, text, uuid) TO service_role;

-- ─── 046: ужесточение защиты owner-уровня (по итогам ревью Codex) ─────────────
--
-- Миграция 044 закрыла удаление/переименование роли owner, но осталось три щели.
-- 044 уже применена — здесь только дополняем, её не переписываем.
--
-- ЩЕЛЬ 1. protect_owner_role() имеет EXECUTE у PUBLIC.
--   Для срабатывания триггера грант не нужен (триггерные функции вызываются
--   движком, а не ролью), поэтому публичный EXECUTE — лишняя поверхность.
--
-- ЩЕЛЬ 2. permission_level owner-роли ничем не защищён, и любой другой роли
--   можно выставить permission_level='owner'. Это НЕ косметика: уровень реально
--   управляет доступом —
--     026_work_schedules.sql:  USING (get_my_role()='owner' OR get_my_permission_level()='owner')
--     025_custom_roles.sql:    аддитивные RLS-политики по get_my_permission_level()
--     src/lib/decomposition/viewer.ts: isManager() -> permission_level='department_head'
--   То есть роль с permission_level='owner' получает owner-уровень в RLS. Запрещаем.
--
-- ЩЕЛЬ 3. create_role_with_permissions(p_permission_level text) не валидирует
--   уровень в рантайме — TS-тип 'employee'|'department_head' не мешает вызвать RPC
--   напрямую с 'owner'. Добавляем проверку в самой функции.

-- ─── 1. Убрать публичный EXECUTE с триггерной функции ─────────────────────────

REVOKE ALL ON FUNCTION public.protect_owner_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_owner_role() FROM anon;
REVOKE ALL ON FUNCTION public.protect_owner_role() FROM authenticated;

-- ─── 2. Расширенный инвариант owner-уровня ────────────────────────────────────
-- Добавляем к правилам 044:
--   * у роли owner нельзя менять permission_level;
--   * никакая другая роль не может иметь permission_level='owner' (INSERT и UPDATE).

CREATE OR REPLACE FUNCTION public.protect_owner_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.name = 'owner' THEN
      RAISE EXCEPTION 'owner_role_protected: роль «Владелец» удалить нельзя';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Новая роль не может родиться с owner-уровнем: это выдало бы ей owner-доступ в RLS.
    IF NEW.permission_level = 'owner' AND NEW.name <> 'owner' THEN
      RAISE EXCEPTION 'owner_level_protected: уровень доступа «owner» зарезервирован за ролью «Владелец»';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF OLD.name = 'owner' THEN
    IF NEW.name <> OLD.name THEN
      RAISE EXCEPTION 'owner_role_protected: системное имя роли «Владелец» изменить нельзя';
    END IF;
    IF NEW.is_system = false THEN
      RAISE EXCEPTION 'owner_role_protected: роль «Владелец» должна оставаться системной';
    END IF;
    IF NEW.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'owner_role_protected: роль «Владелец» нельзя архивировать';
    END IF;
    -- Понижение owner-роли лишило бы систему администратора.
    IF NEW.permission_level <> OLD.permission_level THEN
      RAISE EXCEPTION 'owner_role_protected: уровень доступа роли «Владелец» изменить нельзя';
    END IF;
  ELSE
    -- Эскалация чужой роли до owner-уровня.
    IF NEW.permission_level = 'owner' THEN
      RAISE EXCEPTION 'owner_level_protected: уровень доступа «owner» зарезервирован за ролью «Владелец»';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_owner_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_owner_role() FROM anon;
REVOKE ALL ON FUNCTION public.protect_owner_role() FROM authenticated;

-- Триггер на INSERT (в 044 были только DELETE и UPDATE).
DROP TRIGGER IF EXISTS trg_protect_owner_role_ins ON public.roles;
CREATE TRIGGER trg_protect_owner_role_ins
  BEFORE INSERT ON public.roles
  FOR EACH ROW EXECUTE FUNCTION public.protect_owner_role();

COMMENT ON FUNCTION public.protect_owner_role() IS
  'Инвариант системы прав: роль owner нельзя удалить/переименовать/архивировать, снять is_system '
  'или сменить permission_level; другим ролям permission_level=owner запрещён (миграции 044, 046).';

-- ─── 3. Рантайм-валидация уровня в create_role_with_permissions ───────────────
-- Пересоздаём функцию целиком (тело из 043) с добавленной проверкой уровня.
-- Остальная логика не меняется: атомарный сид ровно 16 прав или откат.

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
  -- Рантайм-валидация: TS-тип в src/actions/access-control.ts не защищает от
  -- прямого вызова RPC. 'owner' и 'accountant' через эту функцию не создаём:
  -- owner — эскалация, accountant — отдельная системная семантика.
  IF p_permission_level IS NULL OR p_permission_level NOT IN ('employee', 'department_head') THEN
    RAISE EXCEPTION 'invalid_permission_level: допустимы только employee и department_head, получено %',
      COALESCE(p_permission_level, 'NULL');
  END IF;

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
  WHERE e->>'resource' = ANY(v_expected)
  ON CONFLICT (role_id, resource) DO NOTHING;

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
REVOKE ALL ON FUNCTION public.create_role_with_permissions(text, text, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.create_role_with_permissions(text, text, text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_role_with_permissions(text, text, text, jsonb) TO service_role;

-- ─── 4. Атомарное увольнение сотрудника + аудит (блокер P1) ───────────────────
-- Раньше archiveEmployee() делал UPDATE и отдельным запросом INSERT в audit_logs:
-- при сбое лога увольнение всё равно проходило, и запись терялась. Здесь обе
-- операции в одной транзакции, плюс возвращаем факт изменения строки — чтобы
-- нельзя было получить «успех» для уже архивного или несуществующего сотрудника.

CREATE OR REPLACE FUNCTION public.dismiss_employee(
  p_employee_id uuid,
  p_actor_id    uuid,
  p_reason      text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_before jsonb;
  v_rows   int;
BEGIN
  -- Снимок «до» и проверка, что сотрудник вообще активен.
  SELECT to_jsonb(t) INTO v_before
  FROM (
    SELECT name, email, role, department_id, status
    FROM public.employees
    WHERE id = p_employee_id AND deleted_at IS NULL
  ) t;

  IF v_before IS NULL THEN
    RETURN false;   -- нет такого сотрудника либо он уже уволен
  END IF;

  UPDATE public.employees
  SET    deleted_at       = now(),
         status           = 'archived',
         dismissal_reason = NULLIF(btrim(COALESCE(p_reason, '')), ''),
         updated_at       = now()
  WHERE  id = p_employee_id
    AND  deleted_at IS NULL;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RETURN false;
  END IF;

  -- action ограничен CHECK-списком audit_logs (create/update/delete/login/logout/
  -- export/view): увольнение — мягкое удаление, конкретика в new_data.event.
  INSERT INTO public.audit_logs (employee_id, action, resource_type, resource_id, old_data, new_data)
  VALUES (
    p_actor_id, 'delete', 'employee', p_employee_id,
    v_before,
    jsonb_build_object(
      'event', 'employee_dismissed',
      'status', 'archived',
      'dismissal_reason', NULLIF(btrim(COALESCE(p_reason, '')), '')
    )
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.dismiss_employee(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dismiss_employee(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.dismiss_employee(uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.dismiss_employee(uuid, uuid, text) TO service_role;

COMMENT ON FUNCTION public.dismiss_employee(uuid, uuid, text) IS
  'Атомарное увольнение: архивирование + запись в audit_logs в одной транзакции. '
  'false — сотрудник не найден или уже уволен (миграция 046).';

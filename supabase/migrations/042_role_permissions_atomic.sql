-- ── P1: атомарное создание роли + ровно 16 permissions + бэкфилл неполных ролей ─
--
-- Блокер Codex #3: создание роли и сид её прав шли отдельными запросами — при сбое
-- оставалась частично засеянная роль (или роль без прав). Решение: одна транзакция.
-- Плюс: на проде есть роли с неполным набором прав ("_"/ЛМ Бот — 0 строк). Бэкфилл
-- дозасевает недостающие (role, resource) как deny-all, чтобы не осталось «дыр».

-- ── Атомарное создание роли с полным набором прав (ровно 16 строк или откат) ───
CREATE OR REPLACE FUNCTION public.create_role_with_permissions(
  p_name             text,
  p_label            text,
  p_permission_level text,
  p_permissions      jsonb   -- массив из 16 объектов {resource,can_view,can_create,can_edit,can_delete,scope}
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_role_id uuid;
  v_count   int;
BEGIN
  INSERT INTO public.roles (name, label, permission_level, is_system)
  VALUES (p_name, p_label, p_permission_level, false)
  RETURNING id INTO v_role_id;

  INSERT INTO public.permissions (role_id, resource, can_view, can_create, can_edit, can_delete, scope)
  SELECT
    v_role_id,
    e->>'resource',
    COALESCE((e->>'can_view')::boolean, false),
    COALESCE((e->>'can_create')::boolean, false),
    COALESCE((e->>'can_edit')::boolean, false),
    -- удаление консультаций новой роли всегда false (owner-only гарантия)
    CASE WHEN e->>'resource' = 'consultations' THEN false ELSE COALESCE((e->>'can_delete')::boolean, false) END,
    COALESCE(e->>'scope', 'own')
  FROM jsonb_array_elements(p_permissions) e
  ON CONFLICT (role_id, resource) DO NOTHING;

  -- Ровно 16 разделов — иначе частичный сид → откат всей транзакции.
  SELECT count(*) INTO v_count FROM public.permissions WHERE role_id = v_role_id;
  IF v_count <> 16 THEN
    RAISE EXCEPTION 'incomplete_permissions_seed: expected 16, got %', v_count;
  END IF;

  RETURN v_role_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_role_with_permissions(text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_role_with_permissions(text, text, text, jsonb) TO service_role;

-- ── Бэкфилл: дозасев недостающих (role, resource) как deny-all ────────────────
-- Приводит все активные роли к полному набору 16 ресурсов. Существующие строки не
-- трогаются (ON CONFLICT DO NOTHING). Чинит частично засеянные роли (напр. "_" на проде).
INSERT INTO public.permissions (role_id, resource, can_view, can_create, can_edit, can_delete, scope)
SELECT
  r.id, res.resource, false, false, false, false,
  CASE WHEN r.permission_level = 'owner' THEN 'all'
       WHEN r.permission_level = 'department_head' THEN 'team'
       ELSE 'own' END
FROM public.roles r
CROSS JOIN (VALUES
  ('dashboard'),('consultations'),('decomposition'),('salaries'),('finances'),
  ('marketing'),('employees'),('calendar'),('attendance'),('tasks'),
  ('notifications'),('documents'),('investors'),('kpi_settings'),('settings'),('integrations')
) AS res(resource)
WHERE r.deleted_at IS NULL
ON CONFLICT (role_id, resource) DO NOTHING;

-- owner всегда полный доступ — выравниваем на случай, если бэкфилл добавил deny-all строки
-- (owner проходит и через хардкод can()=true, но храним таблицу консистентной).
UPDATE public.permissions p
SET can_view = true, can_create = true, can_edit = true, can_delete = true, scope = 'all', updated_at = now()
FROM public.roles r
WHERE p.role_id = r.id AND r.name = 'owner'
  AND NOT (p.can_view AND p.can_create AND p.can_edit AND p.can_delete AND p.scope = 'all');

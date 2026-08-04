-- ─── 065: справочник типов партнёров (редактируемый, не хардкод) ───────────────
--
-- Владелец сможет добавлять свои типы (салон красоты и т.п.). Решение: отдельная
-- мини-таблица partner_types (справочник), а partners.type хранит НАЗВАНИЕ типа
-- (текст = сам ярлык). Почему так:
--   • тип — это справочник (как отделы), логичнее таблицей, чем enum/CHECK;
--   • partners.type = название (а не FK/slug) — существующие данные читаются как есть,
--     мягкое удаление типа не рушит карточки партнёров (ярлык остаётся текстом);
--   • проверка «тип существует» — на уровне приложения по активным типам.
-- Старый CHECK на partners.type снимаем; english-ключи мигрируем в русские названия.

CREATE TABLE IF NOT EXISTS public.partner_types (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  is_system  boolean NOT NULL DEFAULT false,   -- системные (базовые) нельзя удалить
  sort_order integer NOT NULL DEFAULT 100,
  created_by uuid REFERENCES public.employees(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_partner_types_name
  ON public.partner_types (lower(name)) WHERE deleted_at IS NULL;

REVOKE ALL ON TABLE public.partner_types FROM anon, authenticated;
GRANT SELECT ON TABLE public.partner_types TO authenticated;
GRANT ALL    ON TABLE public.partner_types TO service_role;

ALTER TABLE public.partner_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS partner_types_select_by_perm ON public.partner_types;
CREATE POLICY partner_types_select_by_perm ON public.partner_types FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND (SELECT public._my_perm_scope('marketing')) IS NOT NULL);

-- Базовые типы (идемпотентно)
INSERT INTO public.partner_types (name, is_system, sort_order)
SELECT v.name, true, v.ord FROM (VALUES
  ('Косметолог', 10), ('Дерматолог', 20), ('Фитнес', 30), ('Другое', 99)
) AS v(name, ord)
WHERE NOT EXISTS (SELECT 1 FROM public.partner_types t WHERE lower(t.name) = lower(v.name) AND t.deleted_at IS NULL);

-- Снять старый CHECK ПЕРЕД миграцией значений (он допускает только english-ключи)
ALTER TABLE public.partners DROP CONSTRAINT IF EXISTS partners_type_check;
ALTER TABLE public.partners ALTER COLUMN type SET DEFAULT 'Другое';

-- Миграция значений partners.type: english-ключи → русские названия
UPDATE public.partners SET type = 'Косметолог' WHERE type = 'cosmetologist';
UPDATE public.partners SET type = 'Дерматолог' WHERE type = 'dermatologist';
UPDATE public.partners SET type = 'Фитнес'     WHERE type = 'fitness';
UPDATE public.partners SET type = 'Другое'     WHERE type = 'other';

-- ── save_partner: дефолт типа 'Другое' (был 'other'); прочее без изменений ─────
CREATE OR REPLACE FUNCTION public.save_partner(
  p_id    uuid,
  p_data  jsonb,
  p_actor uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_id  uuid;
  v_old jsonb;
  v_new jsonb;
BEGIN
  PERFORM public._assert_actor_active(p_actor);

  IF p_id IS NULL THEN
    INSERT INTO public.partners (name, type, terms, contact, status)
    VALUES (
      p_data->>'name',
      COALESCE(p_data->>'type','Другое'),
      p_data->>'terms',
      p_data->>'contact',
      COALESCE(p_data->>'status','active')
    ) RETURNING id INTO v_id;

    SELECT to_jsonb(p.*) INTO v_new FROM public.partners p WHERE p.id = v_id;
    INSERT INTO public.audit_logs (employee_id, action, resource_type, resource_id, new_data)
    VALUES (p_actor, 'create', 'partners', v_id, v_new);
  ELSE
    SELECT to_jsonb(p.*) INTO v_old FROM public.partners p WHERE p.id = p_id AND p.deleted_at IS NULL FOR UPDATE;
    IF v_old IS NULL THEN RAISE EXCEPTION 'partner_not_found'; END IF;

    UPDATE public.partners SET
      name    = p_data->>'name',
      type    = COALESCE(p_data->>'type','Другое'),
      terms   = p_data->>'terms',
      contact = p_data->>'contact',
      status  = COALESCE(p_data->>'status','active')
    WHERE id = p_id;
    v_id := p_id;

    SELECT to_jsonb(p.*) INTO v_new FROM public.partners p WHERE p.id = v_id;
    INSERT INTO public.audit_logs (employee_id, action, resource_type, resource_id, old_data, new_data)
    VALUES (p_actor, 'update', 'partners', v_id, v_old, v_new);
  END IF;

  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.save_partner(uuid, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_partner(uuid, jsonb, uuid) TO service_role;

-- ── save_partner_type: добавить/переименовать тип (аудит) ──────────────────────
CREATE OR REPLACE FUNCTION public.save_partner_type(p_id uuid, p_name text, p_actor uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_id uuid; v_old jsonb;
BEGIN
  PERFORM public._assert_actor_active(p_actor);
  IF p_name IS NULL OR btrim(p_name) = '' THEN RAISE EXCEPTION 'empty_name'; END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.partner_types (name, is_system, created_by)
    VALUES (btrim(p_name), false, p_actor)
    RETURNING id INTO v_id;
    INSERT INTO public.audit_logs (employee_id, action, resource_type, resource_id, new_data)
    VALUES (p_actor, 'create', 'partner_types', v_id, jsonb_build_object('name', btrim(p_name)));
  ELSE
    SELECT to_jsonb(t.*) INTO v_old FROM public.partner_types t WHERE t.id = p_id AND t.deleted_at IS NULL FOR UPDATE;
    IF v_old IS NULL THEN RAISE EXCEPTION 'type_not_found'; END IF;
    UPDATE public.partner_types SET name = btrim(p_name) WHERE id = p_id;
    v_id := p_id;
    INSERT INTO public.audit_logs (employee_id, action, resource_type, resource_id, old_data, new_data)
    VALUES (p_actor, 'update', 'partner_types', v_id, v_old, jsonb_build_object('name', btrim(p_name)));
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.save_partner_type(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_partner_type(uuid, text, uuid) TO service_role;

-- ── delete_partner_type: мягкое удаление (только несистемные) ──────────────────
CREATE OR REPLACE FUNCTION public.delete_partner_type(p_id uuid, p_actor uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_old jsonb;
BEGIN
  PERFORM public._assert_actor_active(p_actor);
  SELECT to_jsonb(t.*) INTO v_old FROM public.partner_types t WHERE t.id = p_id AND t.deleted_at IS NULL FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'type_not_found'; END IF;
  IF (v_old->>'is_system')::boolean THEN RAISE EXCEPTION 'system_type_protected'; END IF;
  UPDATE public.partner_types SET deleted_at = now() WHERE id = p_id;
  INSERT INTO public.audit_logs (employee_id, action, resource_type, resource_id, old_data)
  VALUES (p_actor, 'delete', 'partner_types', p_id, v_old);
END;
$$;
REVOKE ALL ON FUNCTION public.delete_partner_type(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_partner_type(uuid, uuid) TO service_role;

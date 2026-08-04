-- ─── 063: реестр публикаций (контент) + аудируемые RPC контента и партнёров ────
--
-- Этап 2 маркетинг-декомпозиции: вкладки «Контент» и «Партнёры».
--   1. Таблица content_posts — реестр публикаций (ведётся вручную: доступа к Instagram API нет).
--      RLS company-level permissions-driven по ресурсу marketing (как partners, 061).
--   2. Аудируемые RPC записи (по образцу save_marketing_daily, 054/062): актор-liveness,
--      атомарная запись + запись в audit_logs, EXECUTE только service_role.
--      - save_content_post (insert/update), delete_content_post (soft), save_partner (insert/update).
-- Авторизация (can marketing.edit + scope) выполняется в server action ДО вызова RPC;
-- RPC доступна только service_role, поэтому клиент напрямую её вызвать не может.

-- ── 1. content_posts ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.content_posts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date           date NOT NULL,                     -- дата публикации
  type           text NOT NULL DEFAULT 'post'
                 CHECK (type IN ('reels','carousel','post','stories')),
  author_id      uuid REFERENCES public.employees(id),   -- кто выпустил (nullable)
  title          text,                              -- короткое описание для узнавания
  went_to_target boolean NOT NULL DEFAULT false,    -- шёл ли пост в таргет
  reach          integer NOT NULL DEFAULT 0,        -- охваты
  views          integer NOT NULL DEFAULT 0,        -- просмотры
  engagement     integer NOT NULL DEFAULT 0,        -- вовлечённость (лайки+комменты+сохранения)
  profile_visits integer NOT NULL DEFAULT 0,        -- переходы в профиль
  created_by     uuid REFERENCES public.employees(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz
);

REVOKE ALL ON TABLE public.content_posts FROM anon, authenticated;
GRANT SELECT ON TABLE public.content_posts TO authenticated;
GRANT ALL    ON TABLE public.content_posts TO service_role;

ALTER TABLE public.content_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS content_posts_select_by_perm ON public.content_posts;
CREATE POLICY content_posts_select_by_perm ON public.content_posts FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND (SELECT public._my_perm_scope('marketing')) IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_content_posts_date
  ON public.content_posts (date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_content_posts_went_to_target
  ON public.content_posts (went_to_target) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_content_posts_author
  ON public.content_posts (author_id) WHERE deleted_at IS NULL;

-- ── 2a. save_content_post — insert/update + аудит ─────────────────────────────
CREATE OR REPLACE FUNCTION public.save_content_post(
  p_id    uuid,     -- NULL → создать; иначе обновить
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
    INSERT INTO public.content_posts
      (date, type, author_id, title, went_to_target, reach, views, engagement, profile_visits, created_by)
    VALUES (
      (p_data->>'date')::date,
      COALESCE(p_data->>'type','post'),
      NULLIF(p_data->>'author_id','')::uuid,
      p_data->>'title',
      COALESCE((p_data->>'went_to_target')::boolean, false),
      COALESCE((p_data->>'reach')::integer, 0),
      COALESCE((p_data->>'views')::integer, 0),
      COALESCE((p_data->>'engagement')::integer, 0),
      COALESCE((p_data->>'profile_visits')::integer, 0),
      p_actor
    ) RETURNING id INTO v_id;

    SELECT to_jsonb(c.*) INTO v_new FROM public.content_posts c WHERE c.id = v_id;
    INSERT INTO public.audit_logs (employee_id, action, resource_type, resource_id, new_data)
    VALUES (p_actor, 'create', 'content_posts', v_id, v_new);
  ELSE
    SELECT to_jsonb(c.*) INTO v_old FROM public.content_posts c WHERE c.id = p_id AND c.deleted_at IS NULL FOR UPDATE;
    IF v_old IS NULL THEN RAISE EXCEPTION 'content_post_not_found'; END IF;

    UPDATE public.content_posts SET
      date           = (p_data->>'date')::date,
      type           = COALESCE(p_data->>'type','post'),
      author_id      = NULLIF(p_data->>'author_id','')::uuid,
      title          = p_data->>'title',
      went_to_target = COALESCE((p_data->>'went_to_target')::boolean, false),
      reach          = COALESCE((p_data->>'reach')::integer, 0),
      views          = COALESCE((p_data->>'views')::integer, 0),
      engagement     = COALESCE((p_data->>'engagement')::integer, 0),
      profile_visits = COALESCE((p_data->>'profile_visits')::integer, 0)
    WHERE id = p_id;
    v_id := p_id;

    SELECT to_jsonb(c.*) INTO v_new FROM public.content_posts c WHERE c.id = v_id;
    INSERT INTO public.audit_logs (employee_id, action, resource_type, resource_id, old_data, new_data)
    VALUES (p_actor, 'update', 'content_posts', v_id, v_old, v_new);
  END IF;

  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.save_content_post(uuid, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_content_post(uuid, jsonb, uuid) TO service_role;

-- ── 2b. delete_content_post — soft delete + аудит ─────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_content_post(p_id uuid, p_actor uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_old jsonb;
BEGIN
  PERFORM public._assert_actor_active(p_actor);
  SELECT to_jsonb(c.*) INTO v_old FROM public.content_posts c WHERE c.id = p_id AND c.deleted_at IS NULL FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'content_post_not_found'; END IF;

  UPDATE public.content_posts SET deleted_at = now() WHERE id = p_id;

  INSERT INTO public.audit_logs (employee_id, action, resource_type, resource_id, old_data)
  VALUES (p_actor, 'delete', 'content_posts', p_id, v_old);
END;
$$;
REVOKE ALL ON FUNCTION public.delete_content_post(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_content_post(uuid, uuid) TO service_role;

-- ── 2c. save_partner — insert/update + аудит (деактивация = смена status) ──────
CREATE OR REPLACE FUNCTION public.save_partner(
  p_id    uuid,     -- NULL → создать; иначе обновить
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
      COALESCE(p_data->>'type','other'),
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
      type    = COALESCE(p_data->>'type','other'),
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

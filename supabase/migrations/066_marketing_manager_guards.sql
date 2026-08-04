-- ─── 066: company-level мутации маркетинга — только управляющая роль + топап через RPC ──
--
-- Блокеры Codex:
--  [1] scope=own/team не ограничивал запись в ГЛОБАЛЬНЫЕ маркетинг-данные — активный
--      targetolog (marketing.edit, scope=own) прямым вызовом Server Action мог менять
--      план каналов / чужие публикации / реестр партнёров / типы. RPC проверяли лишь
--      активность актора. Вводим defense-in-depth: company-level мутации — ТОЛЬКО
--      «управляющая роль маркетинга» = marketing.edit со scope IN ('team','all')
--      (owner=all, руководитель=team; рядовой targetolog=own — НЕ проходит).
--      Дневной факт таргетолога (save_marketing_daily) НЕ трогаем — там scope=own корректен.
--  [2] marketing_topups писался прямым insert без RPC/аудита/актор-чека → новая RPC.
--  [3] save_channel_plan не проверял сумму долей = 100% → добавлено (+ date_end>=date_start).

-- ── Хелпер: актор — управляющая роль маркетинга (edit + scope team/all) ─────────
-- Параметризован по employee_id (не auth.uid()): вызывается из SECDEF-RPC под service_role.
CREATE OR REPLACE FUNCTION public._marketing_manage_ok(p_actor uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE(bool_or(p.can_edit AND p.scope IN ('team','all')), false)
  FROM public.employees e
  JOIN public.roles r       ON r.name = e.role AND r.deleted_at IS NULL
  JOIN public.permissions p ON p.role_id = r.id AND p.resource = 'marketing'
  WHERE e.id = p_actor AND e.deleted_at IS NULL AND e.status IN ('active','probation');
$$;
REVOKE ALL ON FUNCTION public._marketing_manage_ok(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._marketing_manage_ok(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public._assert_marketing_manager(p_actor uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT public._marketing_manage_ok(p_actor) THEN
    RAISE EXCEPTION 'not_marketing_manager';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public._assert_marketing_manager(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._assert_marketing_manager(uuid) TO service_role;

-- ── [3]+[1] save_channel_plan — управляющая роль + сумма долей = 100% + период ──
CREATE OR REPLACE FUNCTION public.save_channel_plan(
  p_date_start date,
  p_date_end   date,
  p_shares     jsonb,
  p_actor      uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_old jsonb;
  v_ch  text;
  v_pct numeric;
  v_sum numeric := 0;
BEGIN
  PERFORM public._assert_actor_active(p_actor);
  PERFORM public._assert_marketing_manager(p_actor);

  IF p_date_end < p_date_start THEN RAISE EXCEPTION 'invalid_period'; END IF;

  -- сумма долей должна быть 100% (допуск на дробный ввод ±0.5)
  FOREACH v_ch IN ARRAY ARRAY['target','organic','partner'] LOOP
    v_pct := COALESCE((p_shares->>v_ch)::numeric, 0);
    IF v_pct < 0 OR v_pct > 100 THEN RAISE EXCEPTION 'invalid_share'; END IF;
    v_sum := v_sum + v_pct;
  END LOOP;
  IF abs(v_sum - 100) > 0.5 THEN RAISE EXCEPTION 'invalid_share_sum'; END IF;

  SELECT jsonb_object_agg(channel, share_pct) INTO v_old
  FROM public.marketing_channel_plan
  WHERE date_start = p_date_start AND date_end = p_date_end;

  FOREACH v_ch IN ARRAY ARRAY['target','organic','partner'] LOOP
    v_pct := COALESCE((p_shares->>v_ch)::numeric, 0);
    INSERT INTO public.marketing_channel_plan (date_start, date_end, channel, share_pct, created_by)
    VALUES (p_date_start, p_date_end, v_ch, v_pct, p_actor)
    ON CONFLICT (date_start, date_end, channel)
      DO UPDATE SET share_pct = EXCLUDED.share_pct, updated_at = now();
  END LOOP;

  INSERT INTO public.audit_logs (employee_id, action, resource_type, old_data, new_data)
  VALUES (
    p_actor,
    CASE WHEN v_old IS NULL THEN 'create' ELSE 'update' END,
    'marketing_channel_plan',
    v_old,
    jsonb_build_object('date_start', p_date_start, 'date_end', p_date_end, 'shares', p_shares)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.save_channel_plan(date, date, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_channel_plan(date, date, jsonb, uuid) TO service_role;

-- ── [2] save_marketing_topup — атомарный INSERT + аудит + управляющая роль ─────
CREATE OR REPLACE FUNCTION public.save_marketing_topup(
  p_employee_id uuid,
  p_date        date,
  p_amount_usd  numeric,
  p_amount_som  numeric,
  p_note        text,
  p_actor       uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_id uuid; v_role text; v_status text; v_deleted timestamptz;
BEGIN
  PERFORM public._assert_actor_active(p_actor);
  PERFORM public._assert_marketing_manager(p_actor);

  IF p_amount_usd IS NULL OR p_amount_usd <= 0 THEN RAISE EXCEPTION 'invalid_amount_usd'; END IF;
  IF p_amount_som IS NULL OR p_amount_som <= 0 THEN RAISE EXCEPTION 'invalid_amount_som'; END IF;

  -- цель пополнения — активный таргетолог
  SELECT role, status, deleted_at INTO v_role, v_status, v_deleted
  FROM public.employees WHERE id = p_employee_id FOR UPDATE;
  IF NOT FOUND OR v_deleted IS NOT NULL OR v_status = 'archived' OR v_role <> 'targetolog' THEN
    RAISE EXCEPTION 'target_not_targetolog';
  END IF;

  INSERT INTO public.marketing_topups (employee_id, date, amount_usd, amount_som, note, created_by)
  VALUES (p_employee_id, p_date, p_amount_usd, p_amount_som, p_note, p_actor)
  RETURNING id INTO v_id;

  INSERT INTO public.audit_logs (employee_id, action, resource_type, resource_id, new_data)
  VALUES (p_actor, 'create', 'marketing_topups', v_id,
    jsonb_build_object('employee_id', p_employee_id, 'date', p_date,
      'amount_usd', p_amount_usd, 'amount_som', p_amount_som));

  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.save_marketing_topup(uuid, date, numeric, numeric, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_marketing_topup(uuid, date, numeric, numeric, text, uuid) TO service_role;

-- ── [1] save_content_post — + управляющая роль ────────────────────────────────
CREATE OR REPLACE FUNCTION public.save_content_post(p_id uuid, p_data jsonb, p_actor uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_id uuid; v_old jsonb; v_new jsonb;
BEGIN
  PERFORM public._assert_actor_active(p_actor);
  PERFORM public._assert_marketing_manager(p_actor);

  IF p_id IS NULL THEN
    INSERT INTO public.content_posts
      (date, type, author_id, title, went_to_target, reach, views, engagement, profile_visits, created_by)
    VALUES (
      (p_data->>'date')::date, COALESCE(p_data->>'type','post'), NULLIF(p_data->>'author_id','')::uuid,
      p_data->>'title', COALESCE((p_data->>'went_to_target')::boolean, false),
      COALESCE((p_data->>'reach')::integer, 0), COALESCE((p_data->>'views')::integer, 0),
      COALESCE((p_data->>'engagement')::integer, 0), COALESCE((p_data->>'profile_visits')::integer, 0), p_actor
    ) RETURNING id INTO v_id;
    SELECT to_jsonb(c.*) INTO v_new FROM public.content_posts c WHERE c.id = v_id;
    INSERT INTO public.audit_logs (employee_id, action, resource_type, resource_id, new_data)
    VALUES (p_actor, 'create', 'content_posts', v_id, v_new);
  ELSE
    SELECT to_jsonb(c.*) INTO v_old FROM public.content_posts c WHERE c.id = p_id AND c.deleted_at IS NULL FOR UPDATE;
    IF v_old IS NULL THEN RAISE EXCEPTION 'content_post_not_found'; END IF;
    UPDATE public.content_posts SET
      date = (p_data->>'date')::date, type = COALESCE(p_data->>'type','post'),
      author_id = NULLIF(p_data->>'author_id','')::uuid, title = p_data->>'title',
      went_to_target = COALESCE((p_data->>'went_to_target')::boolean, false),
      reach = COALESCE((p_data->>'reach')::integer, 0), views = COALESCE((p_data->>'views')::integer, 0),
      engagement = COALESCE((p_data->>'engagement')::integer, 0), profile_visits = COALESCE((p_data->>'profile_visits')::integer, 0)
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

-- ── [1] delete_content_post — + управляющая роль ──────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_content_post(p_id uuid, p_actor uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_old jsonb;
BEGIN
  PERFORM public._assert_actor_active(p_actor);
  PERFORM public._assert_marketing_manager(p_actor);
  SELECT to_jsonb(c.*) INTO v_old FROM public.content_posts c WHERE c.id = p_id AND c.deleted_at IS NULL FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'content_post_not_found'; END IF;
  UPDATE public.content_posts SET deleted_at = now() WHERE id = p_id;
  INSERT INTO public.audit_logs (employee_id, action, resource_type, resource_id, old_data)
  VALUES (p_actor, 'delete', 'content_posts', p_id, v_old);
END;
$$;
REVOKE ALL ON FUNCTION public.delete_content_post(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_content_post(uuid, uuid) TO service_role;

-- ── [1] save_partner — + управляющая роль ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.save_partner(p_id uuid, p_data jsonb, p_actor uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_id uuid; v_old jsonb; v_new jsonb;
BEGIN
  PERFORM public._assert_actor_active(p_actor);
  PERFORM public._assert_marketing_manager(p_actor);

  IF p_id IS NULL THEN
    INSERT INTO public.partners (name, type, terms, contact, status)
    VALUES (p_data->>'name', COALESCE(p_data->>'type','Другое'), p_data->>'terms', p_data->>'contact', COALESCE(p_data->>'status','active'))
    RETURNING id INTO v_id;
    SELECT to_jsonb(p.*) INTO v_new FROM public.partners p WHERE p.id = v_id;
    INSERT INTO public.audit_logs (employee_id, action, resource_type, resource_id, new_data)
    VALUES (p_actor, 'create', 'partners', v_id, v_new);
  ELSE
    SELECT to_jsonb(p.*) INTO v_old FROM public.partners p WHERE p.id = p_id AND p.deleted_at IS NULL FOR UPDATE;
    IF v_old IS NULL THEN RAISE EXCEPTION 'partner_not_found'; END IF;
    UPDATE public.partners SET
      name = p_data->>'name', type = COALESCE(p_data->>'type','Другое'),
      terms = p_data->>'terms', contact = p_data->>'contact', status = COALESCE(p_data->>'status','active')
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

-- ── [1] save_partner_type / delete_partner_type — + управляющая роль ──────────
CREATE OR REPLACE FUNCTION public.save_partner_type(p_id uuid, p_name text, p_actor uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_id uuid; v_old jsonb;
BEGIN
  PERFORM public._assert_actor_active(p_actor);
  PERFORM public._assert_marketing_manager(p_actor);
  IF p_name IS NULL OR btrim(p_name) = '' THEN RAISE EXCEPTION 'empty_name'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.partner_types (name, is_system, created_by) VALUES (btrim(p_name), false, p_actor) RETURNING id INTO v_id;
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

CREATE OR REPLACE FUNCTION public.delete_partner_type(p_id uuid, p_actor uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_old jsonb;
BEGIN
  PERFORM public._assert_actor_active(p_actor);
  PERFORM public._assert_marketing_manager(p_actor);
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

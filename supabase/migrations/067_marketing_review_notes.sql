-- ─── 067: закрытие NOTES Codex (APPROVE WITH NOTES) по модулю маркетинга ───────
--
-- NOTE 1 (TOCTOU): существование активного типа партнёра проверялось только в Node.
--   Переносим проверку ВНУТРЬ save_partner (defense-in-depth): при одновременном удалении
--   типа RPC отклонит запись с несуществующим/удалённым типом.
-- NOTE 3 (окно 10→12 арг): 062 удалила старую 10-арг save_marketing_daily. Для безопасного
--   отката ТОЛЬКО кода восстанавливаем 10-арг как compatibility-wrapper, делегирующий в 12-арг
--   (budget = сом как есть, budget_usd=0, lm_appeals=0). Новый код зовёт 12-арг; wrapper нужен
--   лишь если код откатят к пред-062 версии — тогда дневной факт продолжит сохраняться.

-- ── NOTE 1: save_partner — тип обязан существовать в активном справочнике ──────
CREATE OR REPLACE FUNCTION public.save_partner(p_id uuid, p_data jsonb, p_actor uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_id uuid; v_old jsonb; v_new jsonb; v_type text;
BEGIN
  PERFORM public._assert_actor_active(p_actor);
  PERFORM public._assert_marketing_manager(p_actor);

  v_type := COALESCE(p_data->>'type','Другое');
  IF NOT EXISTS (
    SELECT 1 FROM public.partner_types t
    WHERE lower(t.name) = lower(v_type) AND t.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'partner_type_not_found';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.partners (name, type, terms, contact, status)
    VALUES (p_data->>'name', v_type, p_data->>'terms', p_data->>'contact', COALESCE(p_data->>'status','active'))
    RETURNING id INTO v_id;
    SELECT to_jsonb(p.*) INTO v_new FROM public.partners p WHERE p.id = v_id;
    INSERT INTO public.audit_logs (employee_id, action, resource_type, resource_id, new_data)
    VALUES (p_actor, 'create', 'partners', v_id, v_new);
  ELSE
    SELECT to_jsonb(p.*) INTO v_old FROM public.partners p WHERE p.id = p_id AND p.deleted_at IS NULL FOR UPDATE;
    IF v_old IS NULL THEN RAISE EXCEPTION 'partner_not_found'; END IF;
    UPDATE public.partners SET
      name = p_data->>'name', type = v_type,
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

-- ── NOTE 3: 10-арг save_marketing_daily — compatibility-wrapper для отката кода ─
-- Делегирует в 12-арг (budget сом как есть, budget_usd=0, lm_appeals=0). Новый код его НЕ зовёт.
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
BEGIN
  PERFORM public.save_marketing_daily(
    p_employee_id, p_date, p_active_campaigns, p_reach, p_clicks,
    p_budget, 0, p_ad_appeals, 0,
    p_actor_employee_id, p_actor_scope, p_actor_department_id
  );
END;
$$;
REVOKE ALL ON FUNCTION public.save_marketing_daily(uuid, date, integer, integer, integer, numeric, integer, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_marketing_daily(uuid, date, integer, integer, integer, numeric, integer, uuid, text, uuid) TO service_role;

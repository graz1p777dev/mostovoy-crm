-- ─── 061: атрибуция источника консультаций + реестр партнёров ──────────────────
--
-- Фундамент маркетинг-декомпозиции: каждая консультация получает ИСТОЧНИК
-- (таргет / органика / партнёр / сарафан / прочее), а «партнёрские» — ссылку на
-- конкретного партнёра. Без атрибуции экраны «Таргет / Контент / Партнёры»
-- не могут разложить выручку по каналам.
--
-- Состав:
--   1. Таблица public.partners (реестр партнёров-источников) + RLS (permissions-driven,
--      ресурс marketing, company-level — как marketing_plans после 059).
--   2. consultations.source (text + CHECK) и consultations.partner_id (FK → partners).
--   3. Индексы под выборки по source / partner_id / (source,date).
--   4. Проброс source + partner_id в RPC create/update/rebook (по образцу 051 —
--      is_returning_customer). Вся остальная логика RPC сохранена БЕЗ изменений
--      (атомарность, аудит, scope-проверки из 041, FOR UPDATE, SECDEF+search_path,
--      GRANT только service_role). Сигнатуры не меняются → CREATE OR REPLACE.

-- ── 1. Реестр партнёров ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.partners (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  type       text NOT NULL DEFAULT 'other'
             CHECK (type IN ('cosmetologist','dermatologist','fitness','other')),
  terms      text,
  contact    text,
  status     text NOT NULL DEFAULT 'active'
             CHECK (status IN ('active','inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- Права: чтение через RLS (company-level, ресурс marketing); запись — только
-- service_role (server actions). Явный REVOKE + GRANT SELECT — как у locked-таблиц.
REVOKE ALL ON TABLE public.partners FROM anon, authenticated;
GRANT SELECT ON TABLE public.partners TO authenticated;
GRANT ALL    ON TABLE public.partners TO service_role;

ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS partners_select_by_perm ON public.partners;
CREATE POLICY partners_select_by_perm ON public.partners FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND (SELECT public._my_perm_scope('marketing')) IS NOT NULL);

-- ── 2. Источник консультации ──────────────────────────────────────────────────
ALTER TABLE public.consultations
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'other';
-- CHECK — отдельным ALTER c IF NOT EXISTS-охраной через DO (идемпотентно при повторном push)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'consultations_source_check'
  ) THEN
    ALTER TABLE public.consultations
      ADD CONSTRAINT consultations_source_check
      CHECK (source IN ('target','organic','partner','referral','other'));
  END IF;
END $$;

ALTER TABLE public.consultations
  ADD COLUMN IF NOT EXISTS partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL;

-- Согласованность: partner_id заполняется только у source='partner'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'consultations_partner_only_for_partner_source'
  ) THEN
    ALTER TABLE public.consultations
      ADD CONSTRAINT consultations_partner_only_for_partner_source
      CHECK (partner_id IS NULL OR source = 'partner');
  END IF;
END $$;

-- ── 3. Индексы под выборки атрибуции ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_consultations_source
  ON public.consultations (source) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_consultations_source_date
  ON public.consultations (source, date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_consultations_partner
  ON public.consultations (partner_id) WHERE partner_id IS NOT NULL;

-- ── 4a. create_consultation — добавлены source + partner_id ────────────────────
CREATE OR REPLACE FUNCTION public.create_consultation(
  p_data              jsonb,
  p_actor_employee_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_id uuid;
  v_row jsonb;
BEGIN
  INSERT INTO public.consultations (
    date, time, client_name, phone, deal_number, format, manager_id,
    status, alb_status, actual_status, status_after_fv,
    amount, delivery_cost, is_nv, is_returning_customer, comment, consulting_doctor,
    source, partner_id
  ) VALUES (
    (p_data->>'date')::date,
    (p_data->>'time')::time,
    p_data->>'client_name',
    p_data->>'phone',
    p_data->>'deal_number',
    p_data->>'format',
    NULLIF(p_data->>'manager_id','')::uuid,
    p_data->>'status',
    p_data->>'alb_status',
    p_data->>'actual_status',
    p_data->>'status_after_fv',
    COALESCE((p_data->>'amount')::numeric, 0),
    COALESCE((p_data->>'delivery_cost')::numeric, 0),
    COALESCE((p_data->>'is_nv')::boolean, true),
    COALESCE((p_data->>'is_returning_customer')::boolean, false),
    p_data->>'comment',
    p_data->>'consulting_doctor',
    COALESCE(p_data->>'source', 'other'),
    NULLIF(p_data->>'partner_id','')::uuid
  ) RETURNING id INTO v_id;

  SELECT to_jsonb(c.*) INTO v_row FROM public.consultations c WHERE c.id = v_id;

  INSERT INTO public.consultation_audit_log (consultation_id, changed_by, action, changes)
  VALUES (v_id, p_actor_employee_id, 'create', jsonb_build_object('created', v_row));

  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_consultation(jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_consultation(jsonb, uuid) TO service_role;

-- ── 4b. update_consultation — добавлены source + partner_id ────────────────────
CREATE OR REPLACE FUNCTION public.update_consultation(
  p_id                uuid,
  p_data              jsonb,
  p_actor_employee_id uuid,
  p_actor_scope       text,
  p_actor_department_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_old      public.consultations%ROWTYPE;
  v_old_json jsonb;
  v_new_json jsonb;
BEGIN
  SELECT * INTO v_old FROM public.consultations WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'consultation_not_found'; END IF;
  IF v_old.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'consultation_deleted'; END IF;

  IF NOT public._manager_in_scope(v_old.manager_id, p_actor_employee_id, p_actor_scope, p_actor_department_id) THEN
    RAISE EXCEPTION 'scope_violation';
  END IF;
  IF NOT public._manager_in_scope(NULLIF(p_data->>'manager_id','')::uuid, p_actor_employee_id, p_actor_scope, p_actor_department_id) THEN
    RAISE EXCEPTION 'scope_violation';
  END IF;

  v_old_json := to_jsonb(v_old);

  UPDATE public.consultations SET
    date              = (p_data->>'date')::date,
    time              = (p_data->>'time')::time,
    client_name       = p_data->>'client_name',
    phone             = p_data->>'phone',
    deal_number       = p_data->>'deal_number',
    format            = p_data->>'format',
    manager_id        = NULLIF(p_data->>'manager_id','')::uuid,
    status            = p_data->>'status',
    alb_status        = p_data->>'alb_status',
    actual_status     = p_data->>'actual_status',
    status_after_fv   = p_data->>'status_after_fv',
    amount            = COALESCE((p_data->>'amount')::numeric, 0),
    delivery_cost     = COALESCE((p_data->>'delivery_cost')::numeric, 0),
    is_nv             = COALESCE((p_data->>'is_nv')::boolean, true),
    is_returning_customer = COALESCE((p_data->>'is_returning_customer')::boolean, false),
    comment           = p_data->>'comment',
    consulting_doctor = p_data->>'consulting_doctor',
    source            = COALESCE(p_data->>'source', 'other'),
    partner_id        = NULLIF(p_data->>'partner_id','')::uuid,
    updated_at        = now()
  WHERE id = p_id;

  SELECT to_jsonb(c.*) INTO v_new_json FROM public.consultations c WHERE c.id = p_id;

  INSERT INTO public.consultation_audit_log (consultation_id, changed_by, action, changes)
  VALUES (p_id, p_actor_employee_id, 'update', public._consultation_diff(v_old_json, v_new_json));
END;
$$;
REVOKE ALL ON FUNCTION public.update_consultation(uuid, jsonb, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_consultation(uuid, jsonb, uuid, text, uuid) TO service_role;

-- ── 4c. rebook_consultation — добавлены source + partner_id ────────────────────
-- Источник — свойство обращения: переносится и на новую запись, и на старую при её
-- обновлении из p_data (как is_returning_customer).
CREATE OR REPLACE FUNCTION public.rebook_consultation(
  p_old_id            uuid,
  p_new_date          date,
  p_new_time          time,
  p_data              jsonb,
  p_actor_employee_id uuid,
  p_actor_scope       text,
  p_actor_department_id uuid
)
RETURNS TABLE(old_id uuid, new_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_old       public.consultations%ROWTYPE;
  v_old_json  jsonb;
  v_new_id    uuid;
  v_new_json  jsonb;
  v_old_after jsonb;
BEGIN
  SELECT * INTO v_old FROM public.consultations WHERE id = p_old_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'consultation_not_found'; END IF;
  IF v_old.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'consultation_deleted'; END IF;
  IF v_old.rescheduled_to_id IS NOT NULL THEN RAISE EXCEPTION 'already_rescheduled'; END IF;

  IF NOT public._manager_in_scope(v_old.manager_id, p_actor_employee_id, p_actor_scope, p_actor_department_id) THEN
    RAISE EXCEPTION 'scope_violation';
  END IF;
  IF NOT public._manager_in_scope(NULLIF(p_data->>'manager_id','')::uuid, p_actor_employee_id, p_actor_scope, p_actor_department_id) THEN
    RAISE EXCEPTION 'scope_violation';
  END IF;

  v_old_json := to_jsonb(v_old);

  INSERT INTO public.consultations (
    date, time, client_name, phone, deal_number, format, manager_id,
    status, alb_status, actual_status, status_after_fv,
    amount, delivery_cost, is_nv, is_returning_customer, comment, consulting_doctor,
    source, partner_id,
    rescheduled_from_id
  ) VALUES (
    p_new_date, p_new_time,
    p_data->>'client_name', p_data->>'phone', p_data->>'deal_number', p_data->>'format',
    NULLIF(p_data->>'manager_id','')::uuid,
    'Перезаписанный', NULL, NULL, NULL,
    0, 0, true, COALESCE((p_data->>'is_returning_customer')::boolean, false), NULL, NULL,
    COALESCE(p_data->>'source', 'other'),
    NULLIF(p_data->>'partner_id','')::uuid,
    p_old_id
  ) RETURNING id INTO v_new_id;

  UPDATE public.consultations SET
    status            = 'Перезапись',
    client_name       = p_data->>'client_name',
    phone             = p_data->>'phone',
    deal_number       = p_data->>'deal_number',
    format            = p_data->>'format',
    manager_id        = NULLIF(p_data->>'manager_id','')::uuid,
    alb_status        = p_data->>'alb_status',
    actual_status     = p_data->>'actual_status',
    status_after_fv   = p_data->>'status_after_fv',
    amount            = COALESCE((p_data->>'amount')::numeric, 0),
    delivery_cost     = COALESCE((p_data->>'delivery_cost')::numeric, 0),
    is_nv             = COALESCE((p_data->>'is_nv')::boolean, true),
    is_returning_customer = COALESCE((p_data->>'is_returning_customer')::boolean, false),
    comment           = p_data->>'comment',
    consulting_doctor = p_data->>'consulting_doctor',
    source            = COALESCE(p_data->>'source', 'other'),
    partner_id        = NULLIF(p_data->>'partner_id','')::uuid,
    rescheduled_to_id = v_new_id,
    updated_at        = now()
  WHERE id = p_old_id;

  SELECT to_jsonb(c.*) INTO v_old_after FROM public.consultations c WHERE c.id = p_old_id;
  SELECT to_jsonb(c.*) INTO v_new_json  FROM public.consultations c WHERE c.id = v_new_id;

  INSERT INTO public.consultation_audit_log (consultation_id, changed_by, action, changes)
  VALUES
    (p_old_id, p_actor_employee_id, 'rebook', public._consultation_diff(v_old_json, v_old_after)),
    (v_new_id, p_actor_employee_id, 'rebook', jsonb_build_object('created_from', p_old_id, 'created', v_new_json));

  RETURN QUERY SELECT p_old_id, v_new_id;
END;
$$;
REVOKE ALL ON FUNCTION public.rebook_consultation(uuid, date, time, jsonb, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rebook_consultation(uuid, date, time, jsonb, uuid, text, uuid) TO service_role;

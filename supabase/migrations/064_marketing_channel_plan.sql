-- ─── 064: распределение плана обращений по каналам маркетинга ───────────────────
--
-- Вкладка «Общая» отдела маркетинга сводит три канала (таргет/органика/партнёры)
-- против ОБЩЕГО плана по обращениям. Общий план — верхний этап воронки продаж
-- (computeFunnelPlan(companyPlan).appeals), он ДИНАМИЧЕСКИЙ (меняется вслед за планом
-- продаж). Поэтому владелец распределяет план по каналам в ДОЛЯХ (share_pct), а не в
-- абсолютных числах: доли переживают изменение воронки и всегда дают сумму = общий план
-- (per-channel = round(total * share_pct/100)). Ключ — период (тот же, что у плана продаж).
-- Отдельная таблица (не поле в marketing_plans): marketing_plans — это план БЮДЖЕТА
-- таргетолога (другой смысл/период), а здесь — раскладка планового ИНФЛОУ по каналам.

CREATE TABLE IF NOT EXISTS public.marketing_channel_plan (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date_start  date NOT NULL,
  date_end    date NOT NULL,
  channel     text NOT NULL CHECK (channel IN ('target','organic','partner')),
  share_pct   numeric NOT NULL DEFAULT 0 CHECK (share_pct >= 0 AND share_pct <= 100),
  created_by  uuid REFERENCES public.employees(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_marketing_channel_plan_period_channel
  ON public.marketing_channel_plan (date_start, date_end, channel);

REVOKE ALL ON TABLE public.marketing_channel_plan FROM anon, authenticated;
GRANT SELECT ON TABLE public.marketing_channel_plan TO authenticated;
GRANT ALL    ON TABLE public.marketing_channel_plan TO service_role;

ALTER TABLE public.marketing_channel_plan ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS marketing_channel_plan_select_by_perm ON public.marketing_channel_plan;
CREATE POLICY marketing_channel_plan_select_by_perm ON public.marketing_channel_plan FOR SELECT TO authenticated
  USING ((SELECT public._my_perm_scope('marketing')) IS NOT NULL);

-- ── Аудируемая RPC: сохранить распределение (upsert 3 каналов за период) ────────
CREATE OR REPLACE FUNCTION public.save_channel_plan(
  p_date_start date,
  p_date_end   date,
  p_shares     jsonb,   -- {"target":50,"organic":30,"partner":20}
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
BEGIN
  PERFORM public._assert_actor_active(p_actor);

  SELECT jsonb_object_agg(channel, share_pct) INTO v_old
  FROM public.marketing_channel_plan
  WHERE date_start = p_date_start AND date_end = p_date_end;

  FOREACH v_ch IN ARRAY ARRAY['target','organic','partner'] LOOP
    v_pct := COALESCE((p_shares->>v_ch)::numeric, 0);
    IF v_pct < 0 OR v_pct > 100 THEN RAISE EXCEPTION 'invalid_share'; END IF;
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

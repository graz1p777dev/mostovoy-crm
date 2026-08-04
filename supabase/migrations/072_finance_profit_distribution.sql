-- ─── 072: Финансы, шаг 6 — распределение прибыли ──────────────────────────────
--
-- «Умная раскладка»: система берёт чистую прибыль за месяц (P&L из Обзора) и по заданным
-- владельцем долям раскладывает её: инвесторам / погашение долгов / реинвест / владельцу /
-- свои статьи. Владелец задаёт проценты — суммы считает система (net_profit × share%).
--
-- Модель:
--   profit_distribution_rules  — правила (доли), редактирует владелец. «owner» — авто-остаток
--     (100 − сумма остальных), считается на чтении/фиксации, поэтому его share в таблице
--     информативен. Сумма долей НЕ-owner ≤ 100.
--   profit_distributions       — зафиксированный снимок за месяц (net_profit на момент фиксации).
--   profit_distribution_lines  — строки снимка (bucket/name/share/amount). Задел под ДДС (шаг 7):
--     реальные выплаты будут ссылаться на эти строки.
--
-- RLS — permissions-driven по ресурсу finances. Запись — управляющий финансов (owner/руководитель).

-- ── Правила раскладки ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profit_distribution_rules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket      text NOT NULL,                          -- 'investors'|'debt_repayment'|'reinvest'|'owner'|custom
  name        text NOT NULL,
  share_pct   numeric NOT NULL DEFAULT 0 CHECK (share_pct >= 0 AND share_pct <= 100),
  sort_order  integer NOT NULL DEFAULT 100,
  is_system   boolean NOT NULL DEFAULT false,         -- базовые статьи нельзя удалить
  created_by  uuid REFERENCES public.employees(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE INDEX IF NOT EXISTS idx_pdr_active ON public.profit_distribution_rules (sort_order) WHERE deleted_at IS NULL;

REVOKE ALL ON TABLE public.profit_distribution_rules FROM anon, authenticated;
GRANT SELECT ON TABLE public.profit_distribution_rules TO authenticated;
GRANT ALL    ON TABLE public.profit_distribution_rules TO service_role;
ALTER TABLE public.profit_distribution_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pdr_select_by_perm ON public.profit_distribution_rules;
CREATE POLICY pdr_select_by_perm ON public.profit_distribution_rules FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND (SELECT public._my_perm_scope('finances')) IS NOT NULL);

INSERT INTO public.profit_distribution_rules (bucket, name, share_pct, sort_order, is_system)
SELECT v.bucket, v.name, v.share, v.ord, true FROM (VALUES
  ('investors',      'Инвесторам',       20, 10),
  ('debt_repayment', 'Погашение долгов', 10, 20),
  ('reinvest',       'Реинвестиции',     30, 30),
  ('owner',          'Владельцу (остаток)', 40, 40)
) AS v(bucket, name, share, ord)
WHERE NOT EXISTS (SELECT 1 FROM public.profit_distribution_rules r WHERE r.deleted_at IS NULL);

-- ── Зафиксированные раскладки (снимок) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profit_distributions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month   date NOT NULL,                        -- первый день учётного месяца
  net_profit_som numeric NOT NULL,                     -- чистая прибыль на момент фиксации (снимок)
  created_by     uuid REFERENCES public.employees(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz
);
CREATE INDEX IF NOT EXISTS idx_pd_period ON public.profit_distributions (period_month) WHERE deleted_at IS NULL;

REVOKE ALL ON TABLE public.profit_distributions FROM anon, authenticated;
GRANT SELECT ON TABLE public.profit_distributions TO authenticated;
GRANT ALL    ON TABLE public.profit_distributions TO service_role;
ALTER TABLE public.profit_distributions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pd_select_by_perm ON public.profit_distributions;
CREATE POLICY pd_select_by_perm ON public.profit_distributions FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND (SELECT public._my_perm_scope('finances')) IS NOT NULL);

-- ── Строки снимка ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profit_distribution_lines (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  distribution_id uuid NOT NULL REFERENCES public.profit_distributions(id) ON DELETE CASCADE,
  bucket          text NOT NULL,
  name            text NOT NULL,
  share_pct       numeric NOT NULL,
  amount_som      numeric NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pdl_dist ON public.profit_distribution_lines (distribution_id);

REVOKE ALL ON TABLE public.profit_distribution_lines FROM anon, authenticated;
GRANT SELECT ON TABLE public.profit_distribution_lines TO authenticated;
GRANT ALL    ON TABLE public.profit_distribution_lines TO service_role;
ALTER TABLE public.profit_distribution_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pdl_select_by_perm ON public.profit_distribution_lines;
-- Строка видна, если виден её снимок (тот же permissions-driven gate по finances).
CREATE POLICY pdl_select_by_perm ON public.profit_distribution_lines FOR SELECT TO authenticated
  USING ((SELECT public._my_perm_scope('finances')) IS NOT NULL
         AND EXISTS (SELECT 1 FROM public.profit_distributions d WHERE d.id = distribution_id AND d.deleted_at IS NULL));

-- ── save_distribution_rules — полная замена набора правил (batch) ──────────────
-- p_rules — jsonb-массив [{bucket,name,share_pct,sort_order}]. owner-статья — авто-остаток:
-- её share пересчитывается как 100 − сумма остальных. Сумма НЕ-owner долей ≤ 100.
CREATE OR REPLACE FUNCTION public.save_distribution_rules(p_rules jsonb, p_actor uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE r jsonb; v_sum_non_owner numeric := 0; v_has_owner boolean := false; v_bucket text; v_share numeric;
BEGIN
  PERFORM public._assert_actor_active(p_actor);
  PERFORM public._assert_finances_manager(p_actor);
  IF jsonb_typeof(p_rules) <> 'array' OR jsonb_array_length(p_rules) = 0 THEN RAISE EXCEPTION 'rules_required'; END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(p_rules) LOOP
    v_bucket := COALESCE(NULLIF(btrim(r->>'bucket'),''), 'custom');
    v_share  := COALESCE((r->>'share_pct')::numeric, 0);
    IF (r->>'name') IS NULL OR btrim(r->>'name') = '' THEN RAISE EXCEPTION 'name_required'; END IF;
    IF v_share < 0 OR v_share > 100 THEN RAISE EXCEPTION 'invalid_share'; END IF;
    IF v_bucket = 'owner' THEN v_has_owner := true; ELSE v_sum_non_owner := v_sum_non_owner + v_share; END IF;
  END LOOP;
  IF v_sum_non_owner > 100 THEN RAISE EXCEPTION 'shares_exceed_100'; END IF;

  -- Полная замена: мягко гасим текущие, вставляем новые.
  UPDATE public.profit_distribution_rules SET deleted_at = now() WHERE deleted_at IS NULL;
  INSERT INTO public.profit_distribution_rules (bucket, name, share_pct, sort_order, is_system, created_by)
  SELECT COALESCE(NULLIF(btrim(e->>'bucket'),''),'custom'),
         btrim(e->>'name'),
         CASE WHEN COALESCE(NULLIF(btrim(e->>'bucket'),''),'custom') = 'owner'
              THEN GREATEST(100 - v_sum_non_owner, 0)          -- owner = авто-остаток
              ELSE COALESCE((e->>'share_pct')::numeric, 0) END,
         COALESCE((e->>'sort_order')::integer, 100),
         COALESCE((e->>'is_system')::boolean, false),
         p_actor
  FROM jsonb_array_elements(p_rules) e;

  INSERT INTO public.audit_logs (employee_id, action, resource_type, resource_id, new_data)
  VALUES (p_actor, 'update', 'profit_distribution_rules', NULL, p_rules);
END;
$$;
REVOKE ALL ON FUNCTION public.save_distribution_rules(jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_distribution_rules(jsonb, uuid) TO service_role;

-- ── save_profit_distribution — фиксация снимка за месяц (один активный на месяц) ─
-- p_lines — jsonb-массив [{bucket,name,share_pct,amount_som}] (считает сервер из P&L и правил).
CREATE OR REPLACE FUNCTION public.save_profit_distribution(p_period date, p_net_profit numeric, p_lines jsonb, p_actor uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_id uuid; e jsonb;
BEGIN
  PERFORM public._assert_actor_active(p_actor);
  PERFORM public._assert_finances_manager(p_actor);
  IF p_period IS NULL THEN RAISE EXCEPTION 'period_required'; END IF;
  IF jsonb_typeof(p_lines) <> 'array' THEN RAISE EXCEPTION 'lines_required'; END IF;

  -- Один активный снимок на месяц: гасим прежний.
  UPDATE public.profit_distributions SET deleted_at = now() WHERE period_month = p_period AND deleted_at IS NULL;

  INSERT INTO public.profit_distributions (period_month, net_profit_som, created_by)
  VALUES (p_period, COALESCE(p_net_profit, 0), p_actor) RETURNING id INTO v_id;

  FOR e IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    INSERT INTO public.profit_distribution_lines (distribution_id, bucket, name, share_pct, amount_som)
    VALUES (v_id,
            COALESCE(NULLIF(btrim(e->>'bucket'),''),'custom'),
            COALESCE(NULLIF(btrim(e->>'name'),''),'—'),
            COALESCE((e->>'share_pct')::numeric, 0),
            COALESCE((e->>'amount_som')::numeric, 0));
  END LOOP;

  INSERT INTO public.audit_logs (employee_id, action, resource_type, resource_id, new_data)
  VALUES (p_actor, 'create', 'profit_distributions', v_id,
          jsonb_build_object('period_month', p_period, 'net_profit_som', p_net_profit, 'lines', p_lines));
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.save_profit_distribution(date, numeric, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_profit_distribution(date, numeric, jsonb, uuid) TO service_role;

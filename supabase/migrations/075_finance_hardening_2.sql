-- ─── 075: Финансы, ужесточение №2 (раунд 2 ревью) ─────────────────────────────
--
-- Закрывает БЛОКЕР 3 второго раунда: гонка в save_distribution_rules.
--   1. Сериализация конкурентных вызовов через advisory-lock (как в save_profit_distribution).
--   2. Частичный уникальный индекс: не более одной активной owner-статьи → не более
--      одного активного набора правил.
--   3. Сумма долей снимка = РОВНО 100 (numeric), без допуска 0.01: старая проверка
--      abs(sum-100) > 0.01 пропускала и 99.99, и 100.01.
--   4. Проверки существования constraints — по паре (conname, conrelid), а не по имени.
--
-- Миграция идемпотентна: повторный прогон не падает и ничего не дублирует.
-- Данные молча НЕ чинит: если в БД уже есть дубликаты активных owner-статей — падает
-- с внятным сообщением, чтобы человек разобрался, какой набор правильный.

-- ══ 4. Идемпотентность проверок constraints: (conname, conrelid) ══════════════
-- pg_constraint.conname уникален только в паре с conrelid. Проверка «есть ли
-- констрейнт с таким именем» без указания таблицы даёт ложное «уже есть», если
-- одноимённый констрейнт висит на другом отношении, — и нужная проверка не создаётся.
-- Хелпер закрывает это раз и навсегда; ниже пользуемся только им.
CREATE OR REPLACE FUNCTION public._constraint_exists(p_table regclass, p_name text)
RETURNS boolean
LANGUAGE sql STABLE SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = p_table AND conname = p_name
  );
$$;

-- Пересобираем проверки из 074 по правильному критерию. Если констрейнт уже стоит
-- на нужной таблице — ничего не делаем; если его нет (например, в 074 он не создался,
-- потому что имя было занято на другом отношении) — создаём.
DO $$
BEGIN
  IF NOT public._constraint_exists('public.investors', 'investors_profit_share_max') THEN
    ALTER TABLE public.investors ADD CONSTRAINT investors_profit_share_max
      CHECK (profit_share_pct IS NULL OR profit_share_pct <= 100);
  END IF;
  IF NOT public._constraint_exists('public.investors', 'investors_royalty_max') THEN
    ALTER TABLE public.investors ADD CONSTRAINT investors_royalty_max
      CHECK (royalty_pct IS NULL OR royalty_pct <= 100);
  END IF;
  IF NOT public._constraint_exists('public.investors', 'investors_fixed_rate_max') THEN
    ALTER TABLE public.investors ADD CONSTRAINT investors_fixed_rate_max
      CHECK (fixed_rate_pct IS NULL OR fixed_rate_pct <= 1000);
  END IF;
  IF NOT public._constraint_exists('public.investors', 'investors_term_requires_months') THEN
    ALTER TABLE public.investors ADD CONSTRAINT investors_term_requires_months
      CHECK (rate_period IS DISTINCT FROM 'term' OR term_months IS NOT NULL);
  END IF;
  IF NOT public._constraint_exists('public.expense_categories', 'expense_categories_code_format') THEN
    ALTER TABLE public.expense_categories ADD CONSTRAINT expense_categories_code_format
      CHECK (code IS NULL OR code ~ '^[a-z][a-z0-9_]*$');
  END IF;
END $$;

-- ══ 2. PREFLIGHT: дубликаты активных owner-статей ════════════════════════════
-- Уникальный индекс ниже не построится на грязных данных. Падаем ЯВНО и до создания
-- индекса, с указанием, сколько строк мешают, — вместо тихого удаления «лишних»
-- (какая из строк верная, знает только владелец, а не миграция).
DO $preflight$
DECLARE v_owner_rules bigint; v_dup_periods text;
BEGIN
  IF to_regclass('public.profit_distribution_rules') IS NOT NULL THEN
    SELECT count(*) INTO v_owner_rules
    FROM public.profit_distribution_rules
    WHERE deleted_at IS NULL AND bucket = 'owner';
    IF v_owner_rules > 1 THEN
      RAISE EXCEPTION 'preflight_075_multiple_active_owner_rules: активных owner-статей % (допустима 1). Погасите лишние (deleted_at) и повторите миграцию', v_owner_rules;
    END IF;
  END IF;

  -- Заодно страхуем уникальный индекс активного снимка из 074: если на какой-то
  -- период активны два снимка, ux_profit_distributions_active_period уже не создался бы,
  -- но при частично применённой 074 состояние возможно — проверяем явно.
  IF to_regclass('public.profit_distributions') IS NOT NULL THEN
    SELECT string_agg(period_month::text, ', ') INTO v_dup_periods
    FROM (
      SELECT period_month FROM public.profit_distributions
      WHERE deleted_at IS NULL GROUP BY period_month HAVING count(*) > 1
    ) d;
    IF v_dup_periods IS NOT NULL THEN
      RAISE EXCEPTION 'preflight_075_multiple_active_distributions: несколько активных снимков за периоды % — оставьте по одному и повторите', v_dup_periods;
    END IF;
  END IF;
END
$preflight$;

-- ══ 2. Уникальность на уровне индекса ════════════════════════════════════════
-- Набор правил не имеет колонки-идентификатора набора: активный набор — это все строки
-- с deleted_at IS NULL. Поэтому «один активный набор» выражаем через инвариант, который
-- набор обязан соблюдать: в нём РОВНО ОДНА owner-статья (её требует save_distribution_rules,
-- она держит остаток до 100%). Отсюда «не более одной активной owner-строки в БД»
-- ⇒ «не более одного активного набора»: два параллельно вставленных набора дают две
-- owner-строки, и второй коммит падает на этом индексе.
CREATE UNIQUE INDEX IF NOT EXISTS ux_pdr_single_active_owner
  ON public.profit_distribution_rules ((true))
  WHERE deleted_at IS NULL AND bucket = 'owner';

-- ══ 1. save_distribution_rules: advisory-lock + те же инварианты ══════════════
-- Гонка была реальной: UPDATE (гашение старых) и INSERT (запись новых) шли без
-- сериализации, и два владельца, сохранившие правила одновременно, получали два
-- активных набора и две owner-строки. Схема ключа — как в save_profit_distribution:
-- hashtext от строки с префиксом-пространством имён. Ключ отдельный от снимков:
-- справочник правил и фиксация снимка — разные объекты, взаимно блокировать их незачем.
CREATE OR REPLACE FUNCTION public.save_distribution_rules(p_rules jsonb, p_actor uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE r jsonb; v_sum_non_owner numeric := 0; v_owner_count integer := 0; v_bucket text; v_share numeric;
BEGIN
  PERFORM public._assert_actor_active(p_actor);
  PERFORM public._assert_finances_manager(p_actor);
  IF jsonb_typeof(p_rules) <> 'array' OR jsonb_array_length(p_rules) = 0 THEN RAISE EXCEPTION 'rules_required'; END IF;

  -- 075: сериализация до чтения/записи. Второй вызов ждёт здесь и работает уже
  -- с погашенным набором первого, а не параллельно с ним.
  PERFORM pg_advisory_xact_lock(hashtext('profit_distribution_rules:global'));

  FOR r IN SELECT * FROM jsonb_array_elements(p_rules) LOOP
    v_bucket := COALESCE(NULLIF(btrim(r->>'bucket'),''), 'custom');
    v_share  := COALESCE((r->>'share_pct')::numeric, 0);
    IF (r->>'name') IS NULL OR btrim(r->>'name') = '' THEN RAISE EXCEPTION 'name_required'; END IF;
    IF v_share < 0 OR v_share > 100 THEN RAISE EXCEPTION 'invalid_share'; END IF;
    IF v_bucket = 'owner' THEN v_owner_count := v_owner_count + 1;
    ELSE v_sum_non_owner := v_sum_non_owner + v_share; END IF;
  END LOOP;

  IF v_owner_count = 0 THEN RAISE EXCEPTION 'owner_rule_required'; END IF;
  IF v_owner_count > 1 THEN RAISE EXCEPTION 'multiple_owner_rules'; END IF;
  IF v_sum_non_owner > 100 THEN RAISE EXCEPTION 'shares_exceed_100'; END IF;

  UPDATE public.profit_distribution_rules SET deleted_at = now() WHERE deleted_at IS NULL;
  INSERT INTO public.profit_distribution_rules (bucket, name, share_pct, sort_order, is_system, created_by)
  SELECT COALESCE(NULLIF(btrim(e->>'bucket'),''),'custom'),
         btrim(e->>'name'),
         CASE WHEN COALESCE(NULLIF(btrim(e->>'bucket'),''),'custom') = 'owner'
              THEN GREATEST(100 - v_sum_non_owner, 0)
              ELSE COALESCE((e->>'share_pct')::numeric, 0) END,
         COALESCE((e->>'sort_order')::integer, 100),
         COALESCE((e->>'is_system')::boolean, false),
         p_actor
  FROM jsonb_array_elements(p_rules) e;

  INSERT INTO public.audit_logs (employee_id, action, resource_type, resource_id, new_data)
  SELECT p_actor, 'update', 'profit_distribution_rules', NULL,
         jsonb_build_object('rules', COALESCE(jsonb_agg(jsonb_build_object(
           'bucket', x.bucket, 'name', x.name, 'share_pct', x.share_pct, 'sort_order', x.sort_order
         ) ORDER BY x.sort_order, x.name), '[]'::jsonb))
  FROM public.profit_distribution_rules x WHERE x.deleted_at IS NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.save_distribution_rules(jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_distribution_rules(jsonb, uuid) TO service_role;

-- ══ 3. Сумма долей снимка = РОВНО 100 ════════════════════════════════════════
-- Было: abs(sum - 100) > 0.01 → отвергалось лишь то, что дальше копейки. 99.99 и 100.01
-- проходили, и снимок фиксировался с недо-/перераспределением. Доли приходят как numeric
-- (точная десятичная арифметика, не float), owner-статья считается как остаток до 100 —
-- значит ровное равенство достижимо и является корректным требованием.
-- Допуск по СУММАМ (v_tol_amount) остаётся: там округление до копеек неизбежно.
CREATE OR REPLACE FUNCTION public.save_profit_distribution(p_period date, p_net_profit numeric, p_lines jsonb, p_actor uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_id uuid;
  v_owner_count integer; v_bad integer;
  v_sum_share numeric; v_sum_amount numeric; v_lines_count integer;
  v_tol_amount numeric;
BEGIN
  PERFORM public._assert_actor_active(p_actor);
  PERFORM public._assert_finances_manager(p_actor);
  IF p_period IS NULL THEN RAISE EXCEPTION 'period_required'; END IF;
  IF p_period <> date_trunc('month', p_period)::date THEN RAISE EXCEPTION 'period_must_be_month_start'; END IF;
  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN RAISE EXCEPTION 'lines_required'; END IF;
  IF p_net_profit IS NULL THEN RAISE EXCEPTION 'net_profit_required'; END IF;
  IF p_net_profit < 0 THEN RAISE EXCEPTION 'net_profit_negative'; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('profit_distribution:' || p_period::text));

  DROP TABLE IF EXISTS _pd_in;
  CREATE TEMP TABLE _pd_in ON COMMIT DROP AS
  SELECT COALESCE(NULLIF(btrim(e->>'bucket'),''),'custom')      AS bucket,
         COALESCE(NULLIF(btrim(e->>'name'),''),'—')             AS name,
         COALESCE((e->>'share_pct')::numeric, 0)                AS share_pct,
         COALESCE((e->>'amount_som')::numeric, 0)               AS amount_som
  FROM jsonb_array_elements(p_lines) e;

  SELECT count(*), sum(share_pct), sum(amount_som) INTO v_lines_count, v_sum_share, v_sum_amount FROM _pd_in;

  SELECT count(*) INTO v_bad FROM _pd_in WHERE share_pct < 0 OR share_pct > 100 OR amount_som < 0;
  IF v_bad > 0 THEN RAISE EXCEPTION 'invalid_line_values'; END IF;

  SELECT count(*) INTO v_owner_count FROM _pd_in WHERE bucket = 'owner';
  IF v_owner_count = 0 THEN RAISE EXCEPTION 'owner_line_required'; END IF;
  IF v_owner_count > 1 THEN RAISE EXCEPTION 'multiple_owner_lines'; END IF;

  -- 075: строгое равенство в numeric. 99.99 и 100.01 теперь отклоняются.
  IF COALESCE(v_sum_share, 0) <> 100::numeric THEN RAISE EXCEPTION 'shares_must_total_100'; END IF;

  v_tol_amount := 0.01 * v_lines_count + 0.01;
  IF abs(COALESCE(v_sum_amount, 0) - p_net_profit) > v_tol_amount THEN RAISE EXCEPTION 'amounts_must_total_net_profit'; END IF;

  UPDATE public.profit_distributions SET deleted_at = now() WHERE period_month = p_period AND deleted_at IS NULL;

  INSERT INTO public.profit_distributions (period_month, net_profit_som, created_by)
  VALUES (p_period, p_net_profit, p_actor) RETURNING id INTO v_id;

  INSERT INTO public.profit_distribution_lines (distribution_id, bucket, name, share_pct, amount_som)
  SELECT v_id, bucket, name, share_pct, amount_som FROM _pd_in;

  INSERT INTO public.audit_logs (employee_id, action, resource_type, resource_id, new_data)
  SELECT p_actor, 'create', 'profit_distributions', v_id,
         jsonb_build_object(
           'period_month', p_period,
           'net_profit_som', p_net_profit,
           'lines', COALESCE(jsonb_agg(jsonb_build_object(
             'bucket', l.bucket, 'name', l.name, 'share_pct', l.share_pct, 'amount_som', l.amount_som
           ) ORDER BY l.bucket, l.name), '[]'::jsonb))
  FROM public.profit_distribution_lines l WHERE l.distribution_id = v_id;

  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.save_profit_distribution(date, numeric, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_profit_distribution(date, numeric, jsonb, uuid) TO service_role;

REVOKE ALL ON FUNCTION public._constraint_exists(regclass, text) FROM PUBLIC;

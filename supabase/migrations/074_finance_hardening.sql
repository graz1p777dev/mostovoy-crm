-- ─── 074: Финансы — закрытие блокеров ревью (P&L, распределение, инвесторы, ДДС) ─
--
-- Закрывает блокеры внешнего аудита по разделу «Финансы»:
--   Б2  — классификация P&L по неизменяемому `code`, а не по имени категории;
--   Б3  — серверные инварианты распределения прибыли (owner, сумма долей, снимок, гонки);
--   Б4  — верхние границы ставок инвесторов + срок обязателен для rate_period='term';
--   Б5  — запрет движений по закрытому счёту + атомарный перевод между счетами;
--   ТЗ1 — денежные RPC (save_expense/delete_expense) проверяют право finances.edit в SQL.
--
-- Все изменения идемпотентны (IF NOT EXISTS / CREATE OR REPLACE / DO-блоки), миграция
-- безопасна для повторного применения. Данные не удаляются и не пересчитываются.

-- ══ ТЗ1. Право finances.edit на уровне SQL ════════════════════════════════════
-- _finances_manage_ok — это «управляющий» (can_edit + scope team/all). Для рядовых
-- денежных операций нужен именно РЕДАКТОР: can_edit по ресурсу finances при любом
-- scope. Отдельный хелпер, чтобы не ослаблять существующую manager-проверку.
CREATE OR REPLACE FUNCTION public._finances_edit_ok(p_actor uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE(bool_or(p.can_edit), false)
  FROM public.employees e
  JOIN public.roles r       ON r.name = e.role AND r.deleted_at IS NULL
  JOIN public.permissions p ON p.role_id = r.id AND p.resource = 'finances'
  WHERE e.id = p_actor AND e.deleted_at IS NULL AND e.status IN ('active','probation');
$$;
REVOKE ALL ON FUNCTION public._finances_edit_ok(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._finances_edit_ok(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public._assert_finances_editor(p_actor uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT public._finances_edit_ok(p_actor) THEN RAISE EXCEPTION 'not_finances_editor'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public._assert_finances_editor(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._assert_finances_editor(uuid) TO service_role;

-- ══ Б2. Неизменяемый код системных категорий расходов ═════════════════════════
-- P&L классифицировал категории по имени-строке ('Себестоимость товара','Маркетинг'),
-- а переименование системной категории разрешено → классификация ломалась. Вводим
-- `code`: имя владелец меняет как хочет, код неизменен и служит ключом классификации.
ALTER TABLE public.expense_categories ADD COLUMN IF NOT EXISTS code text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expense_categories_code_format') THEN
    ALTER TABLE public.expense_categories
      ADD CONSTRAINT expense_categories_code_format CHECK (code IS NULL OR code ~ '^[a-z][a-z0-9_]*$');
  END IF;
END $$;

-- Бэкфилл системных категорий по текущим именам (одноразово, только пустые коды).
UPDATE public.expense_categories c SET code = v.code
FROM (VALUES
  ('Себестоимость товара', 'cogs'),
  ('Маркетинг',            'marketing'),
  ('Зарплаты / ФОТ',       'payroll'),
  ('Аренда и содержание',  'rent'),
  ('Сервисы / подписки',   'services'),
  ('Прочее',               'other')
) AS v(name, code)
WHERE c.is_system AND c.code IS NULL AND c.name = v.name;

-- Страховка: производная категория (ФОТ) обязана иметь code='payroll' даже если её
-- переименовали до применения миграции.
UPDATE public.expense_categories SET code = 'payroll'
WHERE is_derived AND code IS NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_expense_categories_code
  ON public.expense_categories (code) WHERE code IS NOT NULL AND deleted_at IS NULL;

-- Код неизменен: назначается один раз (миграцией), после этого UPDATE его не меняет.
-- Переименование name при этом разрешено — в этом и смысл разделения.
CREATE OR REPLACE FUNCTION public._expense_category_code_immutable()
RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF OLD.code IS NOT NULL AND NEW.code IS DISTINCT FROM OLD.code THEN
    RAISE EXCEPTION 'category_code_immutable';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_expense_category_code_immutable ON public.expense_categories;
CREATE TRIGGER trg_expense_category_code_immutable
  BEFORE UPDATE ON public.expense_categories
  FOR EACH ROW EXECUTE FUNCTION public._expense_category_code_immutable();

-- ══ ТЗ1 (продолжение). save_expense / delete_expense — проверка права в SQL ════
-- Тело сохранено как в 068, добавлена только проверка finances.edit: денежный RPC
-- не должен полагаться исключительно на Node-гейт.
CREATE OR REPLACE FUNCTION public.save_expense(p_id uuid, p_data jsonb, p_actor uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_id uuid; v_old jsonb; v_new jsonb;
  v_cat uuid; v_cur text; v_rate numeric; v_amt numeric; v_derived boolean;
BEGIN
  PERFORM public._assert_actor_active(p_actor);
  PERFORM public._assert_finances_editor(p_actor);          -- 074: SQL-гейт по finances.edit

  v_cat  := NULLIF(p_data->>'category_id','')::uuid;
  v_cur  := COALESCE(p_data->>'currency','KGS');
  v_rate := COALESCE((p_data->>'rate')::numeric, 1);
  v_amt  := COALESCE((p_data->>'amount_original')::numeric, 0);

  IF v_cat IS NULL THEN RAISE EXCEPTION 'category_required'; END IF;
  SELECT is_derived INTO v_derived FROM public.expense_categories WHERE id = v_cat AND deleted_at IS NULL;
  IF v_derived IS NULL THEN RAISE EXCEPTION 'category_not_found'; END IF;
  IF v_derived THEN RAISE EXCEPTION 'category_is_derived'; END IF;
  IF v_cur NOT IN ('KGS','USD') THEN RAISE EXCEPTION 'invalid_currency'; END IF;
  IF v_cur = 'KGS' THEN v_rate := 1; END IF;
  IF v_rate <= 0 THEN RAISE EXCEPTION 'invalid_rate'; END IF;
  IF v_amt <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.expenses (category_id, name, amount_original, currency, rate, expense_date, is_recurring, period_month, created_by)
    VALUES (v_cat, p_data->>'name', v_amt, v_cur, v_rate,
            (p_data->>'expense_date')::date, COALESCE((p_data->>'is_recurring')::boolean,false),
            (p_data->>'period_month')::date, p_actor)
    RETURNING id INTO v_id;
    SELECT to_jsonb(e.*) INTO v_new FROM public.expenses e WHERE e.id = v_id;
    INSERT INTO public.audit_logs (employee_id, action, resource_type, resource_id, new_data)
    VALUES (p_actor, 'create', 'expenses', v_id, v_new);
  ELSE
    SELECT to_jsonb(e.*) INTO v_old FROM public.expenses e WHERE e.id = p_id AND e.deleted_at IS NULL FOR UPDATE;
    IF v_old IS NULL THEN RAISE EXCEPTION 'expense_not_found'; END IF;
    UPDATE public.expenses SET
      category_id=v_cat, name=p_data->>'name', amount_original=v_amt, currency=v_cur, rate=v_rate,
      expense_date=(p_data->>'expense_date')::date, is_recurring=COALESCE((p_data->>'is_recurring')::boolean,false),
      period_month=(p_data->>'period_month')::date
    WHERE id=p_id;
    v_id := p_id;
    SELECT to_jsonb(e.*) INTO v_new FROM public.expenses e WHERE e.id = v_id;
    INSERT INTO public.audit_logs (employee_id, action, resource_type, resource_id, old_data, new_data)
    VALUES (p_actor, 'update', 'expenses', v_id, v_old, v_new);
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.save_expense(uuid, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_expense(uuid, jsonb, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.delete_expense(p_id uuid, p_actor uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_old jsonb;
BEGIN
  PERFORM public._assert_actor_active(p_actor);
  PERFORM public._assert_finances_editor(p_actor);          -- 074: SQL-гейт по finances.edit
  SELECT to_jsonb(e.*) INTO v_old FROM public.expenses e WHERE e.id = p_id AND e.deleted_at IS NULL FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'expense_not_found'; END IF;
  UPDATE public.expenses SET deleted_at = now() WHERE id = p_id;
  INSERT INTO public.audit_logs (employee_id, action, resource_type, resource_id, old_data)
  VALUES (p_actor, 'delete', 'expenses', p_id, v_old);
END;
$$;
REVOKE ALL ON FUNCTION public.delete_expense(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_expense(uuid, uuid) TO service_role;

-- ══ Б3. Инварианты распределения прибыли ══════════════════════════════════════
-- Один активный снимок на месяц — на уровне индекса, а не только логики RPC.
CREATE UNIQUE INDEX IF NOT EXISTS ux_profit_distributions_active_period
  ON public.profit_distributions (period_month) WHERE deleted_at IS NULL;

-- Правила: ровно одна статья owner, доли не отрицательные, сумма не-owner ≤ 100.
CREATE OR REPLACE FUNCTION public.save_distribution_rules(p_rules jsonb, p_actor uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE r jsonb; v_sum_non_owner numeric := 0; v_owner_count integer := 0; v_bucket text; v_share numeric;
BEGIN
  PERFORM public._assert_actor_active(p_actor);
  PERFORM public._assert_finances_manager(p_actor);
  IF jsonb_typeof(p_rules) <> 'array' OR jsonb_array_length(p_rules) = 0 THEN RAISE EXCEPTION 'rules_required'; END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(p_rules) LOOP
    v_bucket := COALESCE(NULLIF(btrim(r->>'bucket'),''), 'custom');
    v_share  := COALESCE((r->>'share_pct')::numeric, 0);
    IF (r->>'name') IS NULL OR btrim(r->>'name') = '' THEN RAISE EXCEPTION 'name_required'; END IF;
    IF v_share < 0 OR v_share > 100 THEN RAISE EXCEPTION 'invalid_share'; END IF;
    IF v_bucket = 'owner' THEN v_owner_count := v_owner_count + 1;
    ELSE v_sum_non_owner := v_sum_non_owner + v_share; END IF;
  END LOOP;

  -- Б3: owner-статья обязана существовать и быть единственной — она держит остаток,
  -- без неё (или при дубликате) 100% раскладки не сходятся.
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

  -- Б3: в аудит — НОРМАЛИЗОВАННЫЙ записанный набор (с пересчитанной долей owner),
  -- а не входной JSON: аудит должен отражать то, что реально легло в таблицу.
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

-- Фиксация снимка: серверная проверка всех инвариантов + сериализация конкурентных
-- фиксаций через advisory-lock на (период). Клиенту не доверяем ни в чём.
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
  -- Убыток не распределяется: делить нечего, а отрицательные доли бессмысленны.
  IF p_net_profit < 0 THEN RAISE EXCEPTION 'net_profit_negative'; END IF;

  -- Б3: сериализация. Два владельца, жмущие «зафиксировать» одновременно, не создадут
  -- два снимка: второй ждёт на advisory-lock и падает на уникальном индексе/проверке.
  PERFORM pg_advisory_xact_lock(hashtext('profit_distribution:' || p_period::text));

  -- Нормализация входа в один набор + все проверки по нему.
  DROP TABLE IF EXISTS _pd_in;   -- на случай повторного вызова в одной транзакции
  CREATE TEMP TABLE _pd_in ON COMMIT DROP AS
  SELECT COALESCE(NULLIF(btrim(e->>'bucket'),''),'custom')      AS bucket,
         COALESCE(NULLIF(btrim(e->>'name'),''),'—')             AS name,
         COALESCE((e->>'share_pct')::numeric, 0)                AS share_pct,
         COALESCE((e->>'amount_som')::numeric, 0)               AS amount_som
  FROM jsonb_array_elements(p_lines) e;

  SELECT count(*), sum(share_pct), sum(amount_som) INTO v_lines_count, v_sum_share, v_sum_amount FROM _pd_in;

  -- Отрицательные доли/суммы отклоняем.
  SELECT count(*) INTO v_bad FROM _pd_in WHERE share_pct < 0 OR share_pct > 100 OR amount_som < 0;
  IF v_bad > 0 THEN RAISE EXCEPTION 'invalid_line_values'; END IF;

  -- Ровно одна строка owner.
  SELECT count(*) INTO v_owner_count FROM _pd_in WHERE bucket = 'owner';
  IF v_owner_count = 0 THEN RAISE EXCEPTION 'owner_line_required'; END IF;
  IF v_owner_count > 1 THEN RAISE EXCEPTION 'multiple_owner_lines'; END IF;

  -- Сумма долей = 100 с допуском на округление.
  IF abs(COALESCE(v_sum_share, 0) - 100) > 0.01 THEN RAISE EXCEPTION 'shares_must_total_100'; END IF;

  -- Сумма строк = зафиксированной прибыли (допуск — копейка на строку).
  v_tol_amount := 0.01 * v_lines_count + 0.01;
  IF abs(COALESCE(v_sum_amount, 0) - p_net_profit) > v_tol_amount THEN RAISE EXCEPTION 'amounts_must_total_net_profit'; END IF;

  -- Один активный снимок на месяц: прежний гасим (уникальный индекс — страховка).
  UPDATE public.profit_distributions SET deleted_at = now() WHERE period_month = p_period AND deleted_at IS NULL;

  INSERT INTO public.profit_distributions (period_month, net_profit_som, created_by)
  VALUES (p_period, p_net_profit, p_actor) RETURNING id INTO v_id;

  INSERT INTO public.profit_distribution_lines (distribution_id, bucket, name, share_pct, amount_som)
  SELECT v_id, bucket, name, share_pct, amount_som FROM _pd_in;

  -- Б3: аудит — нормализованный записанный набор, не входной JSON.
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

-- ══ Б4. Границы ставок инвесторов и обязательность срока ══════════════════════
-- Доля прибыли и роялти — доли, физически ≤ 100%. Фикс-ставка — процент по вкладу;
-- ставим разумный предел 1000% (защита от опечатки «5000» вместо «50»).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'investors_profit_share_max') THEN
    ALTER TABLE public.investors ADD CONSTRAINT investors_profit_share_max
      CHECK (profit_share_pct IS NULL OR profit_share_pct <= 100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'investors_royalty_max') THEN
    ALTER TABLE public.investors ADD CONSTRAINT investors_royalty_max
      CHECK (royalty_pct IS NULL OR royalty_pct <= 100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'investors_fixed_rate_max') THEN
    ALTER TABLE public.investors ADD CONSTRAINT investors_fixed_rate_max
      CHECK (fixed_rate_pct IS NULL OR fixed_rate_pct <= 1000);
  END IF;
  -- rate_period='term' без срока не определён: «ставка за срок» требует длины срока,
  -- иначе она молча применялась ежемесячно в полном размере.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'investors_term_requires_months') THEN
    ALTER TABLE public.investors ADD CONSTRAINT investors_term_requires_months
      CHECK (rate_period IS DISTINCT FROM 'term' OR term_months IS NOT NULL);
  END IF;
END $$;

-- ══ Б5. ДДС: закрытый счёт и атомарный перевод ════════════════════════════════
-- Движение по закрытому счёту запрещено (счёт закрыт — операций по нему быть не может).
CREATE OR REPLACE FUNCTION public.save_cash_movement(p_id uuid, p_data jsonb, p_actor uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_id uuid; v_old jsonb; v_acc uuid; v_dir text; v_cur text; v_rate numeric; v_amt numeric; v_cat text;
        v_acc_status text;
BEGIN
  PERFORM public._assert_actor_active(p_actor);
  PERFORM public._assert_finances_manager(p_actor);
  v_acc  := NULLIF(p_data->>'account_id','')::uuid;
  v_dir  := COALESCE(p_data->>'direction','');
  v_cur  := COALESCE(p_data->>'currency','KGS');
  v_rate := COALESCE((p_data->>'rate')::numeric, 1);
  v_amt  := COALESCE((p_data->>'amount_original')::numeric, 0);
  v_cat  := COALESCE(p_data->>'category','other');

  IF v_acc IS NULL THEN RAISE EXCEPTION 'account_required'; END IF;
  SELECT status INTO v_acc_status FROM public.cash_accounts WHERE id = v_acc AND deleted_at IS NULL;
  IF v_acc_status IS NULL THEN RAISE EXCEPTION 'account_not_found'; END IF;
  IF v_acc_status <> 'active' THEN RAISE EXCEPTION 'account_closed'; END IF;   -- 074 (Б5)
  IF v_dir NOT IN ('in','out') THEN RAISE EXCEPTION 'invalid_direction'; END IF;
  IF v_cur NOT IN ('KGS','USD') THEN RAISE EXCEPTION 'invalid_currency'; END IF;
  IF v_cur = 'KGS' THEN v_rate := 1; END IF;
  IF v_rate <= 0 THEN RAISE EXCEPTION 'invalid_rate'; END IF;
  IF v_amt  <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  IF v_cat NOT IN ('revenue','expense','salary','debt_repayment','investor_payout','transfer','other') THEN RAISE EXCEPTION 'invalid_category'; END IF;
  -- Б5: перевод — только парой через save_cash_transfer. Одностороннее движение
  -- category='transfer' искажает общий баланс (деньги «появляются»/«исчезают»).
  IF v_cat = 'transfer' THEN RAISE EXCEPTION 'transfer_requires_pair'; END IF;
  IF (p_data->>'movement_date') IS NULL OR btrim(p_data->>'movement_date') = '' THEN RAISE EXCEPTION 'date_required'; END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.cash_movements (account_id, direction, amount_original, currency, rate, movement_date, category, linked_ref, note, created_by)
    VALUES (v_acc, v_dir, v_amt, v_cur, v_rate, (p_data->>'movement_date')::date, v_cat, NULLIF(p_data->>'linked_ref',''), NULLIF(p_data->>'note',''), p_actor)
    RETURNING id INTO v_id;
    INSERT INTO public.audit_logs (employee_id, action, resource_type, resource_id, new_data)
    VALUES (p_actor, 'create', 'cash_movements', v_id, (SELECT to_jsonb(m.*) FROM public.cash_movements m WHERE m.id = v_id));
  ELSE
    SELECT to_jsonb(m.*) INTO v_old FROM public.cash_movements m WHERE m.id = p_id AND m.deleted_at IS NULL FOR UPDATE;
    IF v_old IS NULL THEN RAISE EXCEPTION 'movement_not_found'; END IF;
    IF (v_old->>'category') = 'transfer' THEN RAISE EXCEPTION 'transfer_requires_pair'; END IF;
    UPDATE public.cash_movements SET account_id=v_acc, direction=v_dir, amount_original=v_amt, currency=v_cur, rate=v_rate,
      movement_date=(p_data->>'movement_date')::date, category=v_cat, linked_ref=NULLIF(p_data->>'linked_ref',''), note=NULLIF(p_data->>'note','')
    WHERE id=p_id;
    v_id := p_id;
    INSERT INTO public.audit_logs (employee_id, action, resource_type, resource_id, old_data, new_data)
    VALUES (p_actor, 'update', 'cash_movements', v_id, v_old, (SELECT to_jsonb(m.*) FROM public.cash_movements m WHERE m.id = v_id));
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.save_cash_movement(uuid, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_cash_movement(uuid, jsonb, uuid) TO service_role;

-- Перевод между счетами — атомарная пара out/in в одной транзакции, связанная общим
-- linked_ref. Общий баланс не меняется по построению: одна и та же сомовая сумма
-- уходит с одного счёта и приходит на другой.
CREATE OR REPLACE FUNCTION public.save_cash_transfer(
  p_from uuid, p_to uuid, p_amount_original numeric, p_currency text, p_rate numeric,
  p_date date, p_note text, p_actor uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_ref text; v_rate numeric; v_from_status text; v_to_status text;
BEGIN
  PERFORM public._assert_actor_active(p_actor);
  PERFORM public._assert_finances_manager(p_actor);
  IF p_from IS NULL OR p_to IS NULL THEN RAISE EXCEPTION 'account_required'; END IF;
  IF p_from = p_to THEN RAISE EXCEPTION 'same_account'; END IF;
  IF p_currency NOT IN ('KGS','USD') THEN RAISE EXCEPTION 'invalid_currency'; END IF;
  v_rate := CASE WHEN p_currency = 'KGS' THEN 1 ELSE COALESCE(p_rate, 0) END;
  IF v_rate <= 0 THEN RAISE EXCEPTION 'invalid_rate'; END IF;
  IF COALESCE(p_amount_original, 0) <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  IF p_date IS NULL THEN RAISE EXCEPTION 'date_required'; END IF;

  SELECT status INTO v_from_status FROM public.cash_accounts WHERE id = p_from AND deleted_at IS NULL;
  SELECT status INTO v_to_status   FROM public.cash_accounts WHERE id = p_to   AND deleted_at IS NULL;
  IF v_from_status IS NULL OR v_to_status IS NULL THEN RAISE EXCEPTION 'account_not_found'; END IF;
  IF v_from_status <> 'active' OR v_to_status <> 'active' THEN RAISE EXCEPTION 'account_closed'; END IF;

  v_ref := 'transfer:' || gen_random_uuid()::text;

  INSERT INTO public.cash_movements (account_id, direction, amount_original, currency, rate, movement_date, category, linked_ref, note, created_by)
  VALUES (p_from, 'out', p_amount_original, p_currency, v_rate, p_date, 'transfer', v_ref, NULLIF(btrim(COALESCE(p_note,'')),''), p_actor),
         (p_to,   'in',  p_amount_original, p_currency, v_rate, p_date, 'transfer', v_ref, NULLIF(btrim(COALESCE(p_note,'')),''), p_actor);

  INSERT INTO public.audit_logs (employee_id, action, resource_type, resource_id, new_data)
  VALUES (p_actor, 'create', 'cash_movements', NULL,
          jsonb_build_object('transfer_ref', v_ref, 'from', p_from, 'to', p_to,
                             'amount_original', p_amount_original, 'currency', p_currency,
                             'rate', v_rate, 'movement_date', p_date));
  RETURN v_ref;
END;
$$;
REVOKE ALL ON FUNCTION public.save_cash_transfer(uuid, uuid, numeric, text, numeric, date, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_cash_transfer(uuid, uuid, numeric, text, numeric, date, text, uuid) TO service_role;

-- Удаление половины перевода рассинхронизировало бы счета — гасим пару целиком.
CREATE OR REPLACE FUNCTION public.delete_cash_movement(p_id uuid, p_actor uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_old jsonb; v_ref text;
BEGIN
  PERFORM public._assert_actor_active(p_actor);
  PERFORM public._assert_finances_manager(p_actor);
  SELECT to_jsonb(m.*) INTO v_old FROM public.cash_movements m WHERE m.id = p_id AND m.deleted_at IS NULL FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'movement_not_found'; END IF;

  v_ref := v_old->>'linked_ref';
  IF (v_old->>'category') = 'transfer' AND v_ref IS NOT NULL THEN
    UPDATE public.cash_movements SET deleted_at = now() WHERE linked_ref = v_ref AND deleted_at IS NULL;
  ELSE
    UPDATE public.cash_movements SET deleted_at = now() WHERE id = p_id;
  END IF;

  INSERT INTO public.audit_logs (employee_id, action, resource_type, resource_id, old_data)
  VALUES (p_actor, 'delete', 'cash_movements', p_id, v_old);
END;
$$;
REVOKE ALL ON FUNCTION public.delete_cash_movement(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_cash_movement(uuid, uuid) TO service_role;

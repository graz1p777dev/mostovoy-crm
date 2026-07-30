-- ============================================================
-- Migration 017: Business Triggers
-- Триггеры для автоматических пересчётов.
-- Выполняется после 016 (функции должны существовать).
-- ============================================================

-- ------------------------------------------------------------
-- Вспомогательная функция: trigger_recalc_decomposition
-- Вызывается триггером при изменении consultations/daily_facts.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trigger_recalc_decomposition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_employee_id UUID;
  v_date        DATE;
BEGIN
  -- Определяем employee_id и дату из контекста операции
  IF TG_TABLE_NAME = 'consultations' THEN
    v_employee_id := COALESCE(NEW.manager_id, OLD.manager_id);
    v_date        := COALESCE(NEW.date, OLD.date);
  ELSIF TG_TABLE_NAME = 'daily_facts' THEN
    v_employee_id := COALESCE(NEW.employee_id, OLD.employee_id);
    v_date        := COALESCE(NEW.date, OLD.date);
  END IF;

  IF v_employee_id IS NOT NULL AND v_date IS NOT NULL THEN
    PERFORM public.recalculate_decomposition(
      v_employee_id,
      EXTRACT(YEAR FROM v_date)::SMALLINT,
      EXTRACT(MONTH FROM v_date)::SMALLINT
    );
  END IF;

  RETURN NULL;
END;
$$;

-- Триггер на consultations
CREATE TRIGGER trg_consultations_recalc_decomposition
  AFTER INSERT OR UPDATE OF status_after_fv, actual_status, amount, deleted_at
  ON public.consultations
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_recalc_decomposition();

-- Триггер на daily_facts
CREATE TRIGGER trg_daily_facts_recalc_decomposition
  AFTER INSERT OR UPDATE
  ON public.daily_facts
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_recalc_decomposition();

-- ------------------------------------------------------------
-- Вспомогательная функция: trigger_recalc_finances
-- Вызывается при изменении finance_transactions.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trigger_recalc_finances()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_date DATE;
BEGIN
  v_date := COALESCE(NEW.date, OLD.date);

  IF v_date IS NOT NULL THEN
    PERFORM public.recalculate_finances(
      EXTRACT(YEAR FROM v_date)::SMALLINT,
      EXTRACT(MONTH FROM v_date)::SMALLINT
    );
  END IF;

  RETURN NULL;
END;
$$;

-- Триггер на finance_transactions
CREATE TRIGGER trg_finance_transactions_recalc
  AFTER INSERT OR UPDATE OR DELETE
  ON public.finance_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_recalc_finances();

-- ------------------------------------------------------------
-- Вспомогательная функция: trigger_consultation_sale
-- При продаже (Купила/Предоплата) → создаёт finance_transaction.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trigger_consultation_sale()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_category_id UUID;
BEGIN
  -- Только если статус изменился на Купила/Предоплата
  IF NEW.status_after_fv IN ('Купила','Предоплата')
     AND (OLD.status_after_fv IS DISTINCT FROM NEW.status_after_fv)
     AND NEW.amount > 0
     AND NEW.deleted_at IS NULL
  THEN
    -- Получаем ID категории "Продажи"
    SELECT id INTO v_category_id
    FROM public.finance_categories
    WHERE name = 'Продажи' AND type = 'income' AND is_system = true
    LIMIT 1;

    IF v_category_id IS NOT NULL THEN
      INSERT INTO public.finance_transactions (
        category_id, type, amount, date,
        description, source_type, source_id, created_by
      )
      VALUES (
        v_category_id, 'income', NEW.amount, NEW.date,
        'Продажа: ' || NEW.client_name,
        'consultation', NEW.id, NEW.manager_id
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  -- Если статус сброшен — удаляем автотранзакцию
  IF OLD.status_after_fv IN ('Купила','Предоплата')
     AND NEW.status_after_fv NOT IN ('Купила','Предоплата')
  THEN
    UPDATE public.finance_transactions
    SET deleted_at = NOW()
    WHERE source_type = 'consultation' AND source_id = NEW.id AND deleted_at IS NULL;
  END IF;

  RETURN NULL;
END;
$$;

-- Триггер создания транзакции при продаже
CREATE TRIGGER trg_consultation_sale_transaction
  AFTER UPDATE OF status_after_fv
  ON public.consultations
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_consultation_sale();

-- ------------------------------------------------------------
-- Вспомогательная функция: trigger_salary_paid
-- При выплате зарплаты → создаёт finance_transaction.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trigger_salary_paid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_category_id UUID;
  v_emp_name    TEXT;
BEGIN
  IF NEW.status = 'paid' AND OLD.status != 'paid' THEN
    SELECT id INTO v_category_id
    FROM public.finance_categories
    WHERE name = 'Зарплата' AND type = 'expense' AND is_system = true
    LIMIT 1;

    SELECT name INTO v_emp_name
    FROM public.employees WHERE id = NEW.employee_id;

    IF v_category_id IS NOT NULL THEN
      INSERT INTO public.finance_transactions (
        category_id, type, amount, date,
        description, source_type, source_id
      )
      VALUES (
        v_category_id, 'expense', NEW.total_amount,
        MAKE_DATE(NEW.period_year::INT, NEW.period_month::INT, 1),
        'Зарплата: ' || COALESCE(v_emp_name,'') || ' (' || NEW.period_month || '/' || NEW.period_year || ')',
        'salary', NEW.id
      );
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_salary_paid_transaction
  AFTER UPDATE OF status
  ON public.salaries
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_salary_paid();

-- ------------------------------------------------------------
-- Вспомогательная функция: trigger_investor_payout
-- При создании выплаты инвестору → создаёт finance_transaction.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trigger_investor_payout()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_category_id  UUID;
  v_investor_name TEXT;
  v_tx_id        UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT id INTO v_category_id
    FROM public.finance_categories
    WHERE name = 'Выплата инвестору' AND type = 'expense' AND is_system = true
    LIMIT 1;

    SELECT name INTO v_investor_name
    FROM public.investors WHERE id = NEW.investor_id;

    IF v_category_id IS NOT NULL THEN
      INSERT INTO public.finance_transactions (
        category_id, type, amount, date,
        description, source_type, source_id, created_by
      )
      VALUES (
        v_category_id, 'expense', NEW.amount, NEW.date,
        'Выплата инвестору: ' || COALESCE(v_investor_name,''),
        'investor_payout', NEW.id, NEW.created_by
      )
      RETURNING id INTO v_tx_id;

      -- Сохраняем ссылку на транзакцию
      UPDATE public.investor_payouts
      SET transaction_id = v_tx_id
      WHERE id = NEW.id;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_investor_payout_transaction
  AFTER INSERT
  ON public.investor_payouts
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_investor_payout();

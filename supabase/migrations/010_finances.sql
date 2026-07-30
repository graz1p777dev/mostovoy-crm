-- ============================================================
-- Migration 010: finance_categories + finance_transactions + finances
-- Финансовый модуль.
-- ============================================================

-- ------------------------------------------------------------
-- Таблица: finance_categories
-- ------------------------------------------------------------
CREATE TABLE public.finance_categories (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(100) NOT NULL,
  type       TEXT         NOT NULL,
  color      VARCHAR(7)   DEFAULT '#6b7280',
  icon       VARCHAR(50),
  is_system  BOOLEAN      NOT NULL DEFAULT false,
  is_active  BOOLEAN      NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT finance_categories_type_check CHECK (type IN ('income','expense')),
  CONSTRAINT finance_categories_name_type_unique UNIQUE (name, type)
);

-- Индексы
CREATE INDEX idx_finance_categories_type ON public.finance_categories(type);

-- Триггер updated_at
CREATE TRIGGER set_finance_categories_updated_at
  BEFORE UPDATE ON public.finance_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.finance_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "finance_cat_select_owner_accountant_rop"
  ON public.finance_categories FOR SELECT
  TO authenticated
  USING (public.get_my_role() IN ('owner','accountant','rop'));

CREATE POLICY "finance_cat_insert_owner_accountant"
  ON public.finance_categories FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_role() IN ('owner','accountant'));

CREATE POLICY "finance_cat_update_owner_accountant"
  ON public.finance_categories FOR UPDATE
  TO authenticated
  USING (public.get_my_role() IN ('owner','accountant'));

CREATE POLICY "finance_cat_delete_owner_accountant"
  ON public.finance_categories FOR DELETE
  TO authenticated
  USING (
    public.get_my_role() IN ('owner','accountant')
    AND is_system = false
  );

-- Seed: системные категории
INSERT INTO public.finance_categories (name, type, color, icon, is_system) VALUES
  ('Продажи',          'income',  '#16a34a', 'trending-up',   true),
  ('Инвестиции',       'income',  '#0c4d6c', 'landmark',      false),
  ('Прочие поступления','income', '#6b7280', 'plus-circle',   false),
  ('Зарплата',         'expense', '#dc2626', 'users',         true),
  ('Выплата инвестору','expense', '#0c2136', 'banknote',      true),
  ('Аренда',           'expense', '#d97706', 'building',      false),
  ('Маркетинг',        'expense', '#7c3aed', 'megaphone',     false),
  ('Доставка',         'expense', '#059669', 'truck',         false),
  ('Коммунальные',     'expense', '#6b7280', 'zap',           false),
  ('Прочее',           'expense', '#9ca3af', 'more-horizontal',false);

-- ------------------------------------------------------------
-- Таблица: finance_transactions
-- ------------------------------------------------------------
CREATE TABLE public.finance_transactions (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID          NOT NULL REFERENCES public.finance_categories(id) ON DELETE RESTRICT,
  type        TEXT          NOT NULL,
  amount      NUMERIC(12,2) NOT NULL,
  date        DATE          NOT NULL,
  description TEXT,
  source_type TEXT,
  source_id   UUID,
  created_by  UUID          REFERENCES public.employees(id) ON DELETE SET NULL,
  document_id UUID,         -- FK → documents.id добавится в 013
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT fin_trans_type_check CHECK (type IN ('income','expense')),
  CONSTRAINT fin_trans_amount_check CHECK (amount > 0),
  CONSTRAINT fin_trans_source_check CHECK (
    source_type IS NULL OR source_type IN ('manual','consultation','salary','investor_payout')
  )
);

-- Индексы
CREATE INDEX idx_fin_trans_category_id ON public.finance_transactions(category_id);
CREATE INDEX idx_fin_trans_type        ON public.finance_transactions(type);
CREATE INDEX idx_fin_trans_date        ON public.finance_transactions(date);
CREATE INDEX idx_fin_trans_source      ON public.finance_transactions(source_type, source_id);
CREATE INDEX idx_fin_trans_deleted     ON public.finance_transactions(deleted_at) WHERE deleted_at IS NULL;

-- Триггер updated_at
CREATE TRIGGER set_finance_transactions_updated_at
  BEFORE UPDATE ON public.finance_transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.finance_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fin_trans_select_owner_accountant"
  ON public.finance_transactions FOR SELECT
  TO authenticated
  USING (
    public.get_my_role() IN ('owner','accountant')
    AND deleted_at IS NULL
  );

CREATE POLICY "fin_trans_insert_owner_accountant"
  ON public.finance_transactions FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_role() IN ('owner','accountant'));

CREATE POLICY "fin_trans_update_owner_accountant"
  ON public.finance_transactions FOR UPDATE
  TO authenticated
  USING (public.get_my_role() IN ('owner','accountant'));

CREATE POLICY "fin_trans_delete_owner"
  ON public.finance_transactions FOR DELETE
  TO authenticated
  USING (public.get_my_role() = 'owner');

-- ------------------------------------------------------------
-- Таблица: finances
-- ------------------------------------------------------------
CREATE TABLE public.finances (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  period_year         SMALLINT      NOT NULL,
  period_month        SMALLINT      NOT NULL,
  total_income        NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_expense       NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_profit          NUMERIC(12,2) NOT NULL DEFAULT 0,
  margin_pct          NUMERIC(5,2)  NOT NULL DEFAULT 0,
  last_calculated_at  TIMESTAMPTZ,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT finances_period_unique UNIQUE (period_year, period_month)
);

-- Индексы
CREATE INDEX idx_finances_period ON public.finances(period_year, period_month);

-- Триггер updated_at
CREATE TRIGGER set_finances_updated_at
  BEFORE UPDATE ON public.finances
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.finances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "finances_select_owner_accountant"
  ON public.finances FOR SELECT
  TO authenticated
  USING (public.get_my_role() IN ('owner','accountant'));

CREATE POLICY "finances_insert_owner_accountant"
  ON public.finances FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_role() IN ('owner','accountant'));

CREATE POLICY "finances_update_owner_accountant"
  ON public.finances FOR UPDATE
  TO authenticated
  USING (public.get_my_role() IN ('owner','accountant'));

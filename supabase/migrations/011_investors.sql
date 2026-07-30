-- ============================================================
-- Migration 011: investors + investor_payouts
-- Инвесторы и выплаты им.
-- ============================================================

-- ------------------------------------------------------------
-- Таблица: investors
-- ------------------------------------------------------------
CREATE TABLE public.investors (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name              VARCHAR(255)  NOT NULL,
  phone             VARCHAR(20),
  email             VARCHAR(255),
  share_pct         NUMERIC(5,2)  NOT NULL DEFAULT 0,
  investment_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  investment_date   DATE,
  is_active         BOOLEAN       NOT NULL DEFAULT true,
  notes             TEXT,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT investors_share_check  CHECK (share_pct BETWEEN 0 AND 100),
  CONSTRAINT investors_amount_check CHECK (investment_amount >= 0)
);

-- Индексы
CREATE INDEX idx_investors_is_active ON public.investors(is_active);

-- Триггер updated_at
CREATE TRIGGER set_investors_updated_at
  BEFORE UPDATE ON public.investors
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.investors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "investors_select_owner"
  ON public.investors FOR SELECT
  TO authenticated
  USING (public.get_my_role() = 'owner');

CREATE POLICY "investors_insert_owner"
  ON public.investors FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_role() = 'owner');

CREATE POLICY "investors_update_owner"
  ON public.investors FOR UPDATE
  TO authenticated
  USING (public.get_my_role() = 'owner');

CREATE POLICY "investors_delete_owner"
  ON public.investors FOR DELETE
  TO authenticated
  USING (public.get_my_role() = 'owner');

-- ------------------------------------------------------------
-- Таблица: investor_payouts
-- ------------------------------------------------------------
CREATE TABLE public.investor_payouts (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  investor_id    UUID          NOT NULL REFERENCES public.investors(id) ON DELETE CASCADE,
  amount         NUMERIC(12,2) NOT NULL,
  date           DATE          NOT NULL,
  type           TEXT          NOT NULL DEFAULT 'dividend',
  description    TEXT,
  transaction_id UUID          REFERENCES public.finance_transactions(id) ON DELETE SET NULL,
  created_by     UUID          REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT investor_payouts_amount_check CHECK (amount > 0),
  CONSTRAINT investor_payouts_type_check   CHECK (type IN ('dividend','return','other'))
);

-- Индексы
CREATE INDEX idx_investor_payouts_investor_id ON public.investor_payouts(investor_id);
CREATE INDEX idx_investor_payouts_date        ON public.investor_payouts(date);

-- Триггер updated_at
CREATE TRIGGER set_investor_payouts_updated_at
  BEFORE UPDATE ON public.investor_payouts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.investor_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "investor_payouts_select_owner"
  ON public.investor_payouts FOR SELECT
  TO authenticated
  USING (public.get_my_role() = 'owner');

CREATE POLICY "investor_payouts_insert_owner"
  ON public.investor_payouts FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_role() = 'owner');

CREATE POLICY "investor_payouts_update_owner"
  ON public.investor_payouts FOR UPDATE
  TO authenticated
  USING (public.get_my_role() = 'owner');

CREATE POLICY "investor_payouts_delete_owner"
  ON public.investor_payouts FOR DELETE
  TO authenticated
  USING (public.get_my_role() = 'owner');

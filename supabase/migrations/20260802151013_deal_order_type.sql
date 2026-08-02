-- Тип оформления заказа: стандартная покупка, рассрочка или Trade-in.
ALTER TABLE public.deals
  ADD COLUMN order_type TEXT NOT NULL DEFAULT 'standard';

ALTER TABLE public.deals
  ADD CONSTRAINT deals_order_type_check
  CHECK (order_type IN ('standard', 'installment', 'trade_in'));

CREATE INDEX idx_deals_order_type ON public.deals(order_type);

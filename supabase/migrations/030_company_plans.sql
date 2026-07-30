-- ── Общая декомпозиция компании: план на период с реверсивным расчётом воронки ──
-- Храним только входные параметры; воронка выводится математически.

-- Расширение для EXCLUDE-constraint по диапазону дат
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE public.company_plans (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Период плана (произвольный диапазон)
  date_start        DATE NOT NULL,
  date_end          DATE NOT NULL,
  CONSTRAINT company_plans_dates_valid CHECK (date_end >= date_start),

  -- Входные параметры владельца
  target_revenue    NUMERIC(14,2) NOT NULL CHECK (target_revenue > 0),
  avg_check         NUMERIC(12,2) NOT NULL CHECK (avg_check > 0),

  -- Ориентиры конверсии, %
  conv_appeal_lead  NUMERIC(5,2) NOT NULL CHECK (conv_appeal_lead > 0 AND conv_appeal_lead <= 100),
  conv_lead_nv      NUMERIC(5,2) NOT NULL CHECK (conv_lead_nv     > 0 AND conv_lead_nv     <= 100),
  conv_nv_fv        NUMERIC(5,2) NOT NULL CHECK (conv_nv_fv       > 0 AND conv_nv_fv       <= 100),
  conv_fv_sale      NUMERIC(5,2) NOT NULL CHECK (conv_fv_sale     > 0 AND conv_fv_sale     <= 100),

  created_by        UUID REFERENCES public.employees(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Один план на период: диапазоны дат не могут пересекаться
  CONSTRAINT company_plans_no_overlap
    EXCLUDE USING gist (daterange(date_start, date_end, '[]') WITH &&)
);

CREATE TRIGGER trg_company_plans_updated_at
  BEFORE UPDATE ON public.company_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.company_plans ENABLE ROW LEVEL SECURITY;

-- Видят все аутентифицированные — стратегическая цель компании
CREATE POLICY "company_plans_select" ON public.company_plans
  FOR SELECT TO authenticated USING (true);

-- Изменяют только owner
CREATE POLICY "company_plans_insert" ON public.company_plans
  FOR INSERT TO authenticated WITH CHECK (get_my_role() = 'owner');
CREATE POLICY "company_plans_update" ON public.company_plans
  FOR UPDATE TO authenticated USING (get_my_role() = 'owner');
CREATE POLICY "company_plans_delete" ON public.company_plans
  FOR DELETE TO authenticated USING (get_my_role() = 'owner');

-- ============================================================
-- Migration 007: consultations + consultation_results
-- Центральная операционная таблица: записи на консультацию.
-- ============================================================

-- ------------------------------------------------------------
-- Таблица: consultations
-- ------------------------------------------------------------
CREATE TABLE public.consultations (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id      UUID          REFERENCES public.employees(id) ON DELETE SET NULL,
  recorded_by_id  UUID          REFERENCES public.employees(id) ON DELETE SET NULL,
  date            DATE          NOT NULL,
  time            TIME,
  client_name     VARCHAR(255)  NOT NULL,
  phone           VARCHAR(20),
  deal_number     VARCHAR(20),
  format          TEXT,
  recorded_by     VARCHAR(255),
  status          TEXT,
  actual_status   TEXT,
  status_after_fv TEXT,
  amount          NUMERIC(12,2) NOT NULL DEFAULT 0,
  delivery_cost   NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_nv           BOOLEAN       NOT NULL DEFAULT false,
  comment         TEXT,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT consultations_status_check CHECK (
    status IS NULL OR status IN (
      'Придёт','Не придёт','Перезапись','Отменил','Не отвечает'
    )
  ),
  CONSTRAINT consultations_actual_status_check CHECK (
    actual_status IS NULL OR actual_status IN ('Пришла','Не пришла')
  ),
  CONSTRAINT consultations_status_after_fv_check CHECK (
    status_after_fv IS NULL OR status_after_fv IN (
      'Купила','Не купила','Предоплата','Дожать','Отказ'
    )
  ),
  CONSTRAINT consultations_format_check CHECK (
    format IS NULL OR format IN ('Онлайн','Офлайн')
  ),
  CONSTRAINT consultations_amount_check CHECK (amount >= 0),
  CONSTRAINT consultations_delivery_cost_check CHECK (delivery_cost >= 0)
);

-- Индексы
CREATE INDEX idx_consultations_manager_id   ON public.consultations(manager_id);
CREATE INDEX idx_consultations_date         ON public.consultations(date);
CREATE INDEX idx_consultations_status_after ON public.consultations(status_after_fv);
CREATE INDEX idx_consultations_is_nv        ON public.consultations(is_nv);
CREATE INDEX idx_consultations_deleted      ON public.consultations(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_consultations_date_manager ON public.consultations(date, manager_id);
CREATE INDEX idx_consultations_client_phone ON public.consultations(phone);

-- Триггер updated_at
CREATE TRIGGER set_consultations_updated_at
  BEFORE UPDATE ON public.consultations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.consultations ENABLE ROW LEVEL SECURITY;

-- SELECT
CREATE POLICY "consultations_select_owner_rop"
  ON public.consultations FOR SELECT
  TO authenticated
  USING (
    public.get_my_role() IN ('owner','rop')
    AND deleted_at IS NULL
  );

CREATE POLICY "consultations_select_self"
  ON public.consultations FOR SELECT
  TO authenticated
  USING (
    public.get_my_role() IN ('mp','lmai')
    AND manager_id = public.get_my_employee_id()
    AND deleted_at IS NULL
  );

-- INSERT
CREATE POLICY "consultations_insert_staff"
  ON public.consultations FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_role() IN ('owner','rop','mp','lmai'));

-- UPDATE
CREATE POLICY "consultations_update_owner_rop"
  ON public.consultations FOR UPDATE
  TO authenticated
  USING (
    public.get_my_role() IN ('owner','rop')
    AND deleted_at IS NULL
  );

CREATE POLICY "consultations_update_self"
  ON public.consultations FOR UPDATE
  TO authenticated
  USING (
    public.get_my_role() IN ('mp','lmai')
    AND manager_id = public.get_my_employee_id()
    AND deleted_at IS NULL
  );

-- DELETE (soft delete через deleted_at)
CREATE POLICY "consultations_delete_owner_rop"
  ON public.consultations FOR DELETE
  TO authenticated
  USING (public.get_my_role() IN ('owner','rop'));

CREATE POLICY "consultations_delete_self"
  ON public.consultations FOR DELETE
  TO authenticated
  USING (
    public.get_my_role() IN ('mp','lmai')
    AND manager_id = public.get_my_employee_id()
  );

-- ------------------------------------------------------------
-- Таблица: consultation_results
-- ------------------------------------------------------------
CREATE TABLE public.consultation_results (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id   UUID         NOT NULL REFERENCES public.consultations(id) ON DELETE CASCADE,
  rejection_reason  TEXT,
  next_contact_date DATE,
  product_sold      VARCHAR(255),
  is_repeat_client  BOOLEAN      DEFAULT false,
  source            TEXT,
  extra_data        JSONB,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT consultation_results_cons_id_unique UNIQUE (consultation_id)
);

-- Индексы
CREATE INDEX idx_consultation_results_cons_id ON public.consultation_results(consultation_id);
CREATE INDEX idx_consultation_results_source  ON public.consultation_results(source);

-- Триггер updated_at
CREATE TRIGGER set_consultation_results_updated_at
  BEFORE UPDATE ON public.consultation_results
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.consultation_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cons_results_select_owner_rop"
  ON public.consultation_results FOR SELECT
  TO authenticated
  USING (
    public.get_my_role() IN ('owner','rop')
  );

CREATE POLICY "cons_results_select_self"
  ON public.consultation_results FOR SELECT
  TO authenticated
  USING (
    public.get_my_role() IN ('mp','lmai')
    AND EXISTS (
      SELECT 1 FROM public.consultations c
      WHERE c.id = consultation_results.consultation_id
        AND c.manager_id = public.get_my_employee_id()
    )
  );

CREATE POLICY "cons_results_insert_owner_rop_mp"
  ON public.consultation_results FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_my_role() IN ('owner','rop')
    OR (
      public.get_my_role() IN ('mp','lmai')
      AND EXISTS (
        SELECT 1 FROM public.consultations c
        WHERE c.id = consultation_results.consultation_id
          AND c.manager_id = public.get_my_employee_id()
      )
    )
  );

CREATE POLICY "cons_results_update_owner_rop"
  ON public.consultation_results FOR UPDATE
  TO authenticated
  USING (public.get_my_role() IN ('owner','rop'));

CREATE POLICY "cons_results_update_self"
  ON public.consultation_results FOR UPDATE
  TO authenticated
  USING (
    public.get_my_role() IN ('mp','lmai')
    AND EXISTS (
      SELECT 1 FROM public.consultations c
      WHERE c.id = consultation_results.consultation_id
        AND c.manager_id = public.get_my_employee_id()
    )
  );

CREATE POLICY "cons_results_delete_owner"
  ON public.consultation_results FOR DELETE
  TO authenticated
  USING (public.get_my_role() = 'owner');

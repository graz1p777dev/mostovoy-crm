-- ============================================================
-- Migration 013: documents
-- Метаданные файлов. Файлы хранятся в Supabase Storage.
-- ============================================================

CREATE TABLE public.documents (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  category      TEXT         NOT NULL DEFAULT 'other',
  storage_path  TEXT         NOT NULL,
  mime_type     VARCHAR(100),
  size_bytes    BIGINT,
  uploaded_by   UUID         REFERENCES public.employees(id) ON DELETE SET NULL,
  related_type  TEXT,
  related_id    UUID,
  is_generated  BOOLEAN      NOT NULL DEFAULT false,
  deleted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT documents_category_check CHECK (
    category IN ('contract','regulation','financial','salary_sheet','template','other')
  ),
  CONSTRAINT documents_size_check CHECK (size_bytes IS NULL OR size_bytes > 0)
);

-- Индексы
CREATE INDEX idx_documents_category    ON public.documents(category);
CREATE INDEX idx_documents_related     ON public.documents(related_type, related_id);
CREATE INDEX idx_documents_uploaded_by ON public.documents(uploaded_by);
CREATE INDEX idx_documents_deleted     ON public.documents(deleted_at) WHERE deleted_at IS NULL;

-- Триггер updated_at
CREATE TRIGGER set_documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Добавляем FK из finance_transactions на documents (теперь documents существует)
ALTER TABLE public.finance_transactions
  ADD CONSTRAINT finance_transactions_document_id_fkey
  FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE SET NULL;

-- RLS
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "documents_select_owner_accountant_rop"
  ON public.documents FOR SELECT
  TO authenticated
  USING (
    public.get_my_role() IN ('owner','accountant','rop')
    AND deleted_at IS NULL
  );

CREATE POLICY "documents_select_self"
  ON public.documents FOR SELECT
  TO authenticated
  USING (
    public.get_my_role() IN ('mp','lmai')
    AND uploaded_by = public.get_my_employee_id()
    AND deleted_at IS NULL
  );

CREATE POLICY "documents_insert_owner_accountant"
  ON public.documents FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_role() IN ('owner','accountant'));

CREATE POLICY "documents_update_owner_accountant"
  ON public.documents FOR UPDATE
  TO authenticated
  USING (public.get_my_role() IN ('owner','accountant'));

CREATE POLICY "documents_delete_owner"
  ON public.documents FOR DELETE
  TO authenticated
  USING (public.get_my_role() = 'owner');

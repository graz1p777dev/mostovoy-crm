-- ============================================================
-- Migration 033: document_folders
-- Произвольные вложенные папки поверх уже существующей таблицы
-- public.documents (013_documents.sql) и bucket'а documents
-- (019_storage.sql). Ничего в них не меняет — только добавляет
-- folder_id как необязательную связь.
-- ============================================================

CREATE TABLE public.document_folders (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(255) NOT NULL,
  parent_id  UUID         REFERENCES public.document_folders(id) ON DELETE CASCADE,
  created_by UUID         REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_document_folders_parent ON public.document_folders(parent_id);

ALTER TABLE public.documents
  ADD COLUMN folder_id UUID REFERENCES public.document_folders(id) ON DELETE SET NULL;

CREATE INDEX idx_documents_folder ON public.documents(folder_id);

-- RLS — те же роли, что и у public.documents (013_documents.sql):
-- owner/accountant/rop видят всё, insert — owner/accountant, delete — owner.
-- mp/lmai папки не создают и не видят чужие (документы внутри всё равно
-- отфильтрованы своей RLS на public.documents).
ALTER TABLE public.document_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "document_folders_select_owner_accountant_rop"
  ON public.document_folders FOR SELECT
  TO authenticated
  USING (public.get_my_role() IN ('owner','accountant','rop'));

CREATE POLICY "document_folders_insert_owner_accountant"
  ON public.document_folders FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_role() IN ('owner','accountant'));

CREATE POLICY "document_folders_delete_owner"
  ON public.document_folders FOR DELETE
  TO authenticated
  USING (public.get_my_role() = 'owner');

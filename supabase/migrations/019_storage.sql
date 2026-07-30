-- ============================================================
-- Migration 019: Storage Buckets + Storage RLS
-- Создание bucket'ов и политик доступа к файлам.
-- ============================================================

-- ------------------------------------------------------------
-- Bucket: avatars (public)
-- Аватары сотрудников — публично читаемые.
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  5242880, -- 5 MB
  ARRAY['image/jpeg','image/png','image/webp','image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- RLS для avatars
CREATE POLICY "avatars_select_public"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "avatars_insert_authenticated"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

CREATE POLICY "avatars_update_self"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

CREATE POLICY "avatars_delete_owner_or_self"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (
      public.get_my_role() = 'owner'
      OR (storage.foldername(name))[1] = auth.uid()::TEXT
    )
  );

-- ------------------------------------------------------------
-- Bucket: logos (public)
-- Логотипы компании — публично читаемые.
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'logos',
  'logos',
  true,
  2097152, -- 2 MB
  ARRAY['image/jpeg','image/png','image/webp','image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "logos_select_public"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'logos');

CREATE POLICY "logos_insert_owner"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'logos'
    AND public.get_my_role() = 'owner'
  );

CREATE POLICY "logos_update_owner"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'logos'
    AND public.get_my_role() = 'owner'
  );

CREATE POLICY "logos_delete_owner"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'logos'
    AND public.get_my_role() = 'owner'
  );

-- ------------------------------------------------------------
-- Bucket: documents (private)
-- Документы компании — только авторизованные с правами.
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  false,
  52428800, -- 50 MB
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg','image/png','image/webp',
    'text/plain','text/csv'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- SELECT: owner, accountant, rop — все; mp/lmai — только свои
CREATE POLICY "documents_select_owner_accountant_rop"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'documents'
    AND public.get_my_role() IN ('owner','accountant','rop')
  );

CREATE POLICY "documents_select_self"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'documents'
    AND public.get_my_role() IN ('mp','lmai')
    AND EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.storage_path = name
        AND d.uploaded_by = public.get_my_employee_id()
        AND d.deleted_at IS NULL
    )
  );

-- INSERT: owner, accountant
CREATE POLICY "documents_insert_owner_accountant"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND public.get_my_role() IN ('owner','accountant')
  );

-- UPDATE: owner, accountant
CREATE POLICY "documents_update_owner_accountant"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'documents'
    AND public.get_my_role() IN ('owner','accountant')
  );

-- DELETE: owner только
CREATE POLICY "documents_delete_owner"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'documents'
    AND public.get_my_role() = 'owner'
  );

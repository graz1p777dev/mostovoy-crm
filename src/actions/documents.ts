'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { Document, DocumentFolder, DocumentCategory } from '@/types'

// ─── Результат действия ──────────────────────────────────────────────────────

export type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; error: string }

const BUCKET = 'documents'

// ─── Текущий сотрудник ───────────────────────────────────────────────────────

interface Viewer { id: string; role: string }

async function getViewer(): Promise<Viewer | null> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null

  const { data } = await supabase
    .from('employees')
    .select('id, role')
    .eq('user_id', session.user.id)
    .is('deleted_at', null)
    .maybeSingle()

  return (data as Viewer | null) ?? null
}

// ─── Просмотр папки ──────────────────────────────────────────────────────────

export interface FolderContents {
  folders: DocumentFolder[]
  documents: Document[]
  breadcrumb: DocumentFolder[]
}

async function buildBreadcrumb(
  supabase: Awaited<ReturnType<typeof createClient>>,
  folderId: string | null
): Promise<DocumentFolder[]> {
  const path: DocumentFolder[] = []
  let currentId = folderId
  // Небольшая иерархия папок — обход по одной без риска зависнуть.
  for (let i = 0; i < 50 && currentId; i++) {
    const { data } = await supabase
      .from('document_folders')
      .select('id, name, parent_id, created_by, created_at')
      .eq('id', currentId)
      .maybeSingle()
    if (!data) break
    path.unshift(data as DocumentFolder)
    currentId = (data as DocumentFolder).parent_id
  }
  return path
}

export async function listFolder(folderId: string | null): Promise<ActionResult<FolderContents>> {
  const me = await getViewer()
  if (!me) return { success: false, error: 'Не авторизован' }

  const supabase = await createClient()

  const foldersQuery = supabase
    .from('document_folders')
    .select('id, name, parent_id, created_by, created_at')
    .order('name')
  const docsQuery = supabase
    .from('documents')
    .select('*, uploader:employees(id, name)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  const [{ data: folders, error: foldersError }, { data: docs, error: docsError }] = await Promise.all([
    folderId ? foldersQuery.eq('parent_id', folderId) : foldersQuery.is('parent_id', null),
    folderId ? docsQuery.eq('folder_id', folderId) : docsQuery.is('folder_id', null),
  ])

  if (foldersError) return { success: false, error: foldersError.message }
  if (docsError) return { success: false, error: docsError.message }

  const breadcrumb = await buildBreadcrumb(supabase, folderId)

  return {
    success: true,
    data: {
      folders: (folders as DocumentFolder[]) ?? [],
      documents: (docs as Document[]) ?? [],
      breadcrumb,
    },
  }
}

// ─── Папки ───────────────────────────────────────────────────────────────────

export async function createFolder(name: string, parentId: string | null): Promise<ActionResult<DocumentFolder>> {
  const me = await getViewer()
  if (!me) return { success: false, error: 'Не авторизован' }
  const trimmed = name.trim()
  if (!trimmed) return { success: false, error: 'Название не может быть пустым' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('document_folders')
    .insert({ name: trimmed, parent_id: parentId, created_by: me.id })
    .select('id, name, parent_id, created_by, created_at')
    .single()

  if (error) return { success: false, error: error.message }
  revalidatePath('/dashboard/documents')
  return { success: true, data: data as DocumentFolder }
}

export async function deleteFolder(id: string): Promise<ActionResult> {
  const me = await getViewer()
  if (!me) return { success: false, error: 'Не авторизован' }

  const supabase = await createClient()

  const [{ count: subfolderCount }, { count: docCount }] = await Promise.all([
    supabase.from('document_folders').select('id', { count: 'exact', head: true }).eq('parent_id', id),
    supabase.from('documents').select('id', { count: 'exact', head: true }).eq('folder_id', id).is('deleted_at', null),
  ])

  if ((subfolderCount ?? 0) > 0 || (docCount ?? 0) > 0) {
    return { success: false, error: 'Папка не пуста — сначала удалите файлы и подпапки' }
  }

  const { error } = await supabase.from('document_folders').delete().eq('id', id)
  if (error) return { success: false, error: error.message }
  revalidatePath('/dashboard/documents')
  return { success: true }
}

// ─── Документы ───────────────────────────────────────────────────────────────

export async function uploadDocument(formData: FormData): Promise<ActionResult<Document>> {
  const me = await getViewer()
  if (!me) return { success: false, error: 'Не авторизован' }

  const file = formData.get('file') as File | null
  if (!file || file.size === 0) return { success: false, error: 'Файл не выбран' }

  const folderId = (formData.get('folderId') as string | null) || null
  const category = ((formData.get('category') as string | null) || 'other') as DocumentCategory

  const supabase = await createClient()

  const safeName = file.name.replace(/[^\w.\-А-Яа-яёЁ ]/g, '_')
  const storagePath = `${folderId ?? 'root'}/${crypto.randomUUID()}-${safeName}`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, { contentType: file.type || undefined })
  if (uploadError) return { success: false, error: `Не удалось загрузить файл: ${uploadError.message}` }

  const { data, error: insertError } = await supabase
    .from('documents')
    .insert({
      name: file.name,
      original_name: file.name,
      category,
      storage_path: storagePath,
      mime_type: file.type || null,
      size_bytes: file.size,
      uploaded_by: me.id,
      folder_id: folderId,
    })
    .select('*, uploader:employees(id, name)')
    .single()

  if (insertError) {
    // Метаданные не записались — не оставляем сиротский файл в Storage.
    await supabase.storage.from(BUCKET).remove([storagePath])
    return { success: false, error: insertError.message }
  }

  revalidatePath('/dashboard/documents')
  return { success: true, data: data as Document }
}

export async function deleteDocument(id: string): Promise<ActionResult> {
  const me = await getViewer()
  if (!me) return { success: false, error: 'Не авторизован' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('documents')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { success: false, error: error.message }
  revalidatePath('/dashboard/documents')
  return { success: true }
}

export async function getSignedUrl(storagePath: string): Promise<ActionResult<string>> {
  const me = await getViewer()
  if (!me) return { success: false, error: 'Не авторизован' }

  const supabase = await createClient()
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 60)
  if (error || !data) return { success: false, error: error?.message ?? 'Не удалось получить ссылку' }
  return { success: true, data: data.signedUrl }
}

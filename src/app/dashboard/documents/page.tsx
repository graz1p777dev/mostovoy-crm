'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import {
  Folder, FolderPlus, Upload, FileText, Image as ImageIcon, FileSpreadsheet,
  File as FileIcon, Download, Trash2, MoreVertical, ChevronRight, X,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import Modal from '@/components/Modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  listFolder, createFolder, deleteFolder, uploadDocument, deleteDocument, getSignedUrl,
  type FolderContents,
} from '@/actions/documents'
import type { Document, DocumentFolder, UserRole } from '@/types'

const navy = '#1b1517'
const steel = '#6b6063'

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fileIconFor(mime: string | null) {
  if (!mime) return FileIcon
  if (mime.startsWith('image/')) return ImageIcon
  if (mime.includes('sheet') || mime.includes('excel') || mime === 'text/csv') return FileSpreadsheet
  if (mime === 'application/pdf' || mime.includes('word')) return FileText
  return FileIcon
}

export default function DocumentsPage() {
  const { user } = useAuth()
  const role = user?.role as UserRole | undefined
  const canWrite = role === 'owner' || role === 'accountant'
  const canDelete = role === 'owner'

  const router = useRouter()
  const searchParams = useSearchParams()
  const folderId = searchParams.get('folder')

  const [contents, setContents] = useState<FolderContents | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [preview, setPreview] = useState<{ doc: Document; url: string | null } | null>(null)
  const [, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(() => {
    setLoading(true)
    listFolder(folderId).then(res => {
      if (res.success && res.data) setContents(res.data)
      else toast.error(res.success ? 'Ошибка загрузки' : res.error)
      setLoading(false)
    })
  }, [folderId])

  useEffect(() => {
    // Deferred so the initial setLoading(true) doesn't run synchronously
    // inside the effect body (react-hooks/set-state-in-effect).
    const timer = setTimeout(load, 0)
    return () => clearTimeout(timer)
  }, [load])

  const goToFolder = (id: string | null) => {
    router.push(id ? `/dashboard/documents?folder=${id}` : '/dashboard/documents')
  }

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading(true)
    for (const file of Array.from(files)) {
      const formData = new FormData()
      formData.set('file', file)
      if (folderId) formData.set('folderId', folderId)
      const res = await uploadDocument(formData)
      if (!res.success) toast.error(res.error)
    }
    setUploading(false)
    toast.success('Файлы загружены')
    load()
  }

  const handleCreateFolder = async () => {
    const res = await createFolder(newFolderName, folderId)
    if (!res.success) { toast.error(res.error); return }
    toast.success('Папка создана')
    setNewFolderName('')
    setNewFolderOpen(false)
    load()
  }

  const handleDeleteFolder = (folder: DocumentFolder) => {
    if (!confirm(`Удалить папку «${folder.name}»?`)) return
    startTransition(async () => {
      const res = await deleteFolder(folder.id)
      if (!res.success) toast.error(res.error)
      else { toast.success('Папка удалена'); load() }
    })
  }

  const handleDeleteDocument = (doc: Document) => {
    if (!confirm(`Удалить файл «${doc.name}»?`)) return
    startTransition(async () => {
      const res = await deleteDocument(doc.id)
      if (!res.success) toast.error(res.error)
      else { toast.success('Файл удалён'); load() }
    })
  }

  const openPreview = async (doc: Document) => {
    setPreview({ doc, url: null })
    const res = await getSignedUrl(doc.storage_path)
    if (res.success) setPreview({ doc, url: res.data ?? null })
    else toast.error(res.error)
  }

  const isEmpty = contents && contents.folders.length === 0 && contents.documents.length === 0

  return (
    <div className="p-4 md:p-8 flex flex-col gap-5 max-w-6xl">
      {/* Хлебные крошки */}
      <div className="flex items-center gap-1.5 text-sm flex-wrap">
        <button onClick={() => goToFolder(null)} className="font-medium hover:underline" style={{ color: folderId ? steel : navy }}>
          Документы
        </button>
        {contents?.breadcrumb.map(f => (
          <span key={f.id} className="flex items-center gap-1.5">
            <ChevronRight size={14} color={steel} />
            <button
              onClick={() => goToFolder(f.id)}
              className="font-medium hover:underline"
              style={{ color: f.id === folderId ? navy : steel }}
            >
              {f.name}
            </button>
          </span>
        ))}
      </div>

      {/* Панель действий */}
      {canWrite && (
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setNewFolderOpen(true)}>
            <FolderPlus size={15} className="mr-1.5" /> Новая папка
          </Button>
          <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            <Upload size={15} className="mr-1.5" /> {uploading ? 'Загрузка…' : 'Загрузить'}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={e => { void handleUpload(e.target.files); e.target.value = '' }}
          />
        </div>
      )}

      {/* Сетка */}
      <div
        className="rounded-2xl bg-white p-5 min-h-[300px]"
        style={{ border: dragOver ? '2px dashed #e11d1d' : '1px solid var(--border)' }}
        onDragOver={e => { if (canWrite) { e.preventDefault(); setDragOver(true) } }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault()
          setDragOver(false)
          if (canWrite) void handleUpload(e.dataTransfer.files)
        }}
      >
        {loading ? (
          <p className="text-sm" style={{ color: steel }}>Загрузка…</p>
        ) : isEmpty ? (
          <p className="text-sm text-center py-10" style={{ color: steel }}>
            В этой папке пока нет файлов{canWrite && ' — перетащите сюда файл или нажмите «Загрузить»'}
          </p>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
            {contents?.folders.map(folder => (
              <div
                key={folder.id}
                className="group relative rounded-xl p-3.5 flex flex-col gap-2 cursor-pointer hover:shadow-sm transition-shadow"
                style={{ border: '1px solid var(--border)' }}
                onClick={() => goToFolder(folder.id)}
              >
                <Folder size={28} color="#e11d1d" />
                <span className="text-sm font-medium truncate" style={{ color: navy }} title={folder.name}>
                  {folder.name}
                </span>
                {canDelete && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      onClick={e => e.stopPropagation()}
                      className="absolute top-2 right-2 rounded-md p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ color: steel }}
                    >
                      <MoreVertical size={15} />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent onClick={e => e.stopPropagation()}>
                      <DropdownMenuItem onClick={() => handleDeleteFolder(folder)} className="text-red-600">
                        <Trash2 size={14} className="mr-2" /> Удалить
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            ))}

            {contents?.documents.map(doc => {
              const Icon = fileIconFor(doc.mime_type)
              return (
                <div
                  key={doc.id}
                  className="group relative rounded-xl p-3.5 flex flex-col gap-2 cursor-pointer hover:shadow-sm transition-shadow"
                  style={{ border: '1px solid var(--border)' }}
                  onClick={() => openPreview(doc)}
                >
                  <Icon size={28} color={steel} />
                  <span className="text-sm font-medium truncate" style={{ color: navy }} title={doc.name}>
                    {doc.name}
                  </span>
                  <span className="text-xs" style={{ color: steel }}>
                    {formatBytes(doc.size_bytes)} · {formatDate(doc.created_at)}
                  </span>
                  {(canDelete || (canWrite && doc.uploaded_by === user?.id)) && (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        onClick={e => e.stopPropagation()}
                        className="absolute top-2 right-2 rounded-md p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ color: steel }}
                      >
                        <MoreVertical size={15} />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent onClick={e => e.stopPropagation()}>
                        <DropdownMenuItem onClick={() => handleDeleteDocument(doc)} className="text-red-600">
                          <Trash2 size={14} className="mr-2" /> Удалить
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Новая папка */}
      {newFolderOpen && (
        <Modal onClose={() => setNewFolderOpen(false)}>
          <div className="rounded-2xl bg-white p-5 w-80 flex flex-col gap-3">
            <h3 className="font-bold text-sm" style={{ color: navy }}>Новая папка</h3>
            <Input
              autoFocus
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void handleCreateFolder() }}
              placeholder="Название папки"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setNewFolderOpen(false)}>Отмена</Button>
              <Button onClick={() => void handleCreateFolder()} disabled={!newFolderName.trim()}>Создать</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Просмотр документа */}
      {preview && (
        <Modal onClose={() => setPreview(null)}>
          <div className="rounded-2xl bg-white p-5 w-[min(90vw,700px)] flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm truncate" style={{ color: navy }}>{preview.doc.name}</h3>
              <button onClick={() => setPreview(null)} style={{ color: steel }}><X size={18} /></button>
            </div>
            {!preview.url ? (
              <p className="text-sm" style={{ color: steel }}>Загрузка…</p>
            ) : preview.doc.mime_type?.startsWith('image/') ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview.url} alt={preview.doc.name} className="max-h-[70vh] w-full object-contain rounded-lg" />
            ) : preview.doc.mime_type === 'application/pdf' ? (
              <iframe src={preview.url} className="w-full rounded-lg" style={{ height: '70vh' }} />
            ) : (
              <p className="text-sm" style={{ color: steel }}>Предпросмотр недоступен для этого типа файла.</p>
            )}
            {preview.url && (
              <a href={preview.url} download={preview.doc.original_name} target="_blank" rel="noopener noreferrer">
                <Button className="w-full"><Download size={15} className="mr-1.5" /> Скачать</Button>
              </a>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}

'use client'

import { useEffect, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Save, Pencil, Trash2, Building2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  getDepartments, createDepartment, updateDepartment, deleteDepartment,
  type DeptRow,
} from '@/actions/settings'
import { SectionCard } from './SectionCard'

export function DepartmentsPanel() {
  const [depts, setDepts]            = useState<DeptRow[]>([])
  const [loading, setLoading]        = useState(true)
  const [addingNew, setAddingNew]    = useState(false)
  const [newName, setNewName]        = useState('')
  const [newDesc, setNewDesc]        = useState('')
  const [editingId, setEditingId]    = useState<string | null>(null)
  const [editName, setEditName]      = useState('')
  const [editDesc, setEditDesc]      = useState('')
  const [isPending, startTransition] = useTransition()
  const [reloadKey, setReloadKey]    = useState(0)

  const reload = () => setReloadKey(k => k + 1)

  useEffect(() => {
    getDepartments().then(d => { setDepts(d); setLoading(false) })
  }, [reloadKey])

  const handleAdd = () => {
    if (!newName.trim()) { toast.error('Введите название'); return }
    startTransition(async () => {
      const r = await createDepartment(newName, newDesc)
      if (r.success) {
        toast.success('Отдел добавлен')
        setAddingNew(false); setNewName(''); setNewDesc('')
        reload()
      } else toast.error(r.error)
    })
  }

  const handleEdit = (d: DeptRow) => {
    setEditingId(d.id); setEditName(d.name); setEditDesc(d.description ?? '')
  }

  const handleSaveEdit = () => {
    if (!editingId) return
    startTransition(async () => {
      const r = await updateDepartment(editingId, editName, editDesc)
      if (r.success) {
        toast.success('Сохранено')
        setEditingId(null)
        reload()
      } else toast.error(r.error)
    })
  }

  const handleDelete = (d: DeptRow) => {
    if (!confirm(`Удалить отдел «${d.name}»? Действие необратимо.`)) return
    startTransition(async () => {
      const r = await deleteDepartment(d.id)
      if (r.success) {
        toast.success('Отдел удалён')
        reload()
      } else toast.error(r.error)
    })
  }

  return (
    <SectionCard icon={<Building2 size={15} color="var(--on-brand)" />} title="Отделы">
      {addingNew ? (
        <div className="mb-4 p-3 rounded-xl space-y-2" style={{ backgroundColor: 'var(--paper-2)', border: '1px solid var(--line)' }}>
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-gray-500">Название *</Label>
            <Input value={newName} onChange={e => setNewName(e.target.value)}
              placeholder="Отдел продаж" className="h-8 rounded-lg text-sm border-gray-200" autoFocus />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-gray-500">Описание</Label>
            <Input value={newDesc} onChange={e => setNewDesc(e.target.value)}
              placeholder="Необязательно" className="h-8 rounded-lg text-sm border-gray-200" />
          </div>
          <div className="flex gap-2 pt-1">
            <Button size="sm" className="h-7 rounded-lg text-xs text-white" style={{ backgroundColor: 'var(--brand)' }}
              onClick={handleAdd} disabled={isPending}>
              <Save size={12} className="mr-1" /> Сохранить
            </Button>
            <Button variant="ghost" size="sm" className="h-7 rounded-lg text-xs"
              onClick={() => { setAddingNew(false); setNewName(''); setNewDesc('') }} disabled={isPending}>
              Отмена
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="mb-4 h-8 rounded-xl gap-1.5 text-xs"
          style={{ borderColor: 'var(--brand)', color: 'var(--brand)' }} onClick={() => setAddingNew(true)}>
          <Plus size={13} /> Добавить отдел
        </Button>
      )}

      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-10 rounded-xl animate-pulse" style={{ backgroundColor: 'var(--paper-2)' }} />
          ))}
        </div>
      ) : depts.length === 0 ? (
        <p className="text-sm text-center py-4" style={{ color: 'var(--ink-3)' }}>Нет отделов</p>
      ) : (
        <div className="space-y-2">
          {depts.map(d => (
            <div key={d.id} className="rounded-xl px-3 py-2.5"
              style={{ backgroundColor: 'var(--paper-2)', border: '1px solid var(--line)' }}>
              {editingId === d.id ? (
                <div className="space-y-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] font-semibold text-gray-400 uppercase">Название *</Label>
                    <Input value={editName} onChange={e => setEditName(e.target.value)}
                      className="h-7 rounded-lg text-sm border-gray-200" autoFocus />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-semibold text-gray-400 uppercase">Описание</Label>
                    <Input value={editDesc} onChange={e => setEditDesc(e.target.value)}
                      placeholder="Описание отдела" className="h-7 rounded-lg text-sm border-gray-200" />
                  </div>
                  <div className="flex gap-1.5">
                    <Button size="sm" className="h-6 rounded-lg text-xs text-white px-2"
                      style={{ backgroundColor: 'var(--brand)' }} onClick={handleSaveEdit} disabled={isPending}>
                      <Save size={11} className="mr-1" /> Сохранить
                    </Button>
                    <Button variant="ghost" size="sm" className="h-6 rounded-lg text-xs px-2"
                      onClick={() => setEditingId(null)} disabled={isPending}>Отмена</Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate" style={{ color: 'var(--ink)' }}>{d.name}</div>
                    {d.description && (
                      <div className="text-[11px] truncate mt-0.5" style={{ color: 'var(--ink-3)' }}>{d.description}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => handleEdit(d)} className="p-1 rounded-lg hover:bg-gray-200 transition-colors"
                      title="Редактировать" disabled={isPending}>
                      <Pencil size={13} style={{ color: 'var(--ink-3)' }} />
                    </button>
                    <button onClick={() => handleDelete(d)} className="p-1 rounded-lg hover:bg-red-100 transition-colors"
                      title="Удалить" disabled={isPending}>
                      <Trash2 size={13} style={{ color: 'var(--bad-border)' }} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}

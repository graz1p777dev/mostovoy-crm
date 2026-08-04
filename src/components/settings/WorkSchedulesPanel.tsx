'use client'

import { useEffect, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Save, Pencil, Trash2, CalendarDays } from 'lucide-react'
import { toast } from 'sonner'
import {
  getWorkSchedules, createWorkSchedule, updateWorkSchedule, deleteWorkSchedule,
  type WorkScheduleRow,
} from '@/actions/settings'
import { SectionCard } from './SectionCard'

export function WorkSchedulesPanel() {
  const [schedules, setSchedules]    = useState<WorkScheduleRow[]>([])
  const [loading, setLoading]        = useState(true)
  const [reloadKey, setReloadKey]    = useState(0)
  const [editingId, setEditingId]    = useState<string | null>(null)
  const [editForm, setEditForm]      = useState({ name: '', description: '' })
  const [addingNew, setAddingNew]    = useState(false)
  const [newForm, setNewForm]        = useState({ name: '', description: '' })
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    getWorkSchedules().then(s => { setSchedules(s); setLoading(false) })
  }, [reloadKey])

  const reload = () => setReloadKey(k => k + 1)

  const handleStartEdit = (s: WorkScheduleRow) => {
    setEditingId(s.id)
    setEditForm({ name: s.name, description: s.description ?? '' })
  }

  const handleSaveEdit = (s: WorkScheduleRow) => {
    // Для системных — имя не меняем, передаём исходное
    const nameToSave = s.is_system ? s.name : editForm.name
    startTransition(async () => {
      const r = await updateWorkSchedule(s.id, nameToSave, editForm.description)
      if (r.success) {
        toast.success('График обновлён')
        setEditingId(null)
        reload()
      } else toast.error(r.error)
    })
  }

  const handleCreate = () => {
    if (!newForm.name.trim()) { toast.error('Введите название'); return }
    startTransition(async () => {
      const r = await createWorkSchedule(newForm.name, newForm.description)
      if (r.success) {
        toast.success('График добавлен')
        setAddingNew(false)
        setNewForm({ name: '', description: '' })
        reload()
      } else toast.error(r.error)
    })
  }

  const handleDelete = (s: WorkScheduleRow) => {
    if (!confirm(`Удалить график «${s.name}»? Действие необратимо.`)) return
    startTransition(async () => {
      const r = await deleteWorkSchedule(s.id)
      if (r.success) {
        toast.success('График удалён')
        reload()
      } else toast.error(r.error)
    })
  }

  return (
    <SectionCard icon={<CalendarDays size={15} color="var(--on-brand)" />} title="Графики работы">
      {addingNew ? (
        <div className="mb-4 p-3 rounded-xl space-y-2" style={{ backgroundColor: 'var(--paper-2)', border: '1px solid var(--line)' }}>
          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ink-3)' }}>Новый график</p>
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-gray-500">Название *</Label>
            <Input value={newForm.name} onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))}
              placeholder='Например: "4/3" или "Гибкий"' className="h-8 rounded-lg text-sm border-gray-200" autoFocus />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-gray-500">Описание</Label>
            <Input value={newForm.description} onChange={e => setNewForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Как работает этот график..." className="h-8 rounded-lg text-sm border-gray-200" />
          </div>
          <div className="flex gap-2 pt-1">
            <Button size="sm" className="h-7 rounded-lg text-xs text-white" style={{ backgroundColor: 'var(--brand)' }}
              onClick={handleCreate} disabled={isPending}>
              <Save size={12} className="mr-1" /> Сохранить
            </Button>
            <Button variant="ghost" size="sm" className="h-7 rounded-lg text-xs"
              onClick={() => setAddingNew(false)} disabled={isPending}>Отмена</Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="mb-4 h-8 rounded-xl gap-1.5 text-xs"
          style={{ borderColor: 'var(--brand)', color: 'var(--brand)' }} onClick={() => setAddingNew(true)}>
          <Plus size={13} /> Добавить график
        </Button>
      )}

      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-12 rounded-xl animate-pulse" style={{ backgroundColor: 'var(--paper-2)' }} />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {schedules.map(s => (
            <div key={s.id} className="rounded-xl px-3 py-2.5"
              style={{ backgroundColor: 'var(--paper-2)', border: '1px solid var(--line)' }}>
              {editingId === s.id ? (
                <div className="space-y-2">
                  {!s.is_system && (
                    <div className="space-y-1">
                      <Label className="text-[10px] font-semibold text-gray-400 uppercase">Название *</Label>
                      <Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                        className="h-7 rounded-lg text-sm border-gray-200" autoFocus />
                    </div>
                  )}
                  <div className="space-y-1">
                    <Label className="text-[10px] font-semibold text-gray-400 uppercase">Описание</Label>
                    <Input value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                      placeholder="Описание графика..." className="h-7 rounded-lg text-sm border-gray-200"
                      autoFocus={s.is_system} />
                  </div>
                  <div className="flex gap-1.5 pt-0.5">
                    <Button size="sm" className="h-6 rounded-lg text-xs text-white px-2"
                      style={{ backgroundColor: 'var(--brand)' }} onClick={() => handleSaveEdit(s)} disabled={isPending}>
                      <Save size={11} className="mr-1" /> Сохранить
                    </Button>
                    <Button variant="ghost" size="sm" className="h-6 rounded-lg text-xs px-2"
                      onClick={() => setEditingId(null)} disabled={isPending}>Отмена</Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <span className="shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: 'var(--info-soft)', color: 'var(--info)' }}>{s.name}</span>
                      {s.is_system && (
                        <span className="text-[10px]" style={{ color: 'var(--ink-3)' }}>системный</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => handleStartEdit(s)}
                        className="p-1 rounded-lg hover:bg-gray-200 transition-colors" disabled={isPending}>
                        <Pencil size={13} style={{ color: 'var(--ink-3)' }} />
                      </button>
                      {!s.is_system && (
                        <button onClick={() => handleDelete(s)}
                          className="p-1 rounded-lg hover:bg-red-100 transition-colors" title="Удалить" disabled={isPending}>
                          <Trash2 size={13} style={{ color: 'var(--bad-border)' }} />
                        </button>
                      )}
                    </div>
                  </div>
                  {s.description ? (
                    <p className="mt-1 text-[11px]" style={{ color: 'var(--ink-3)' }}>{s.description}</p>
                  ) : (
                    <p className="mt-1 text-[11px] italic" style={{ color: 'var(--line-strong)' }}>Описание не задано</p>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}

'use client'

import { useEffect, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Save, Pencil, Trash2, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import {
  getRoles, updateRole, deleteRole,
  type RoleRow,
} from '@/actions/settings'
import { SectionCard } from './SectionCard'

const ROLE_BADGE: Record<string, { bg: string; color: string }> = {
  owner:     { bg: 'var(--paper)', color: 'var(--brand-ink)' },
  rop:       { bg: 'var(--ok-soft)', color: 'var(--ok)' },
  mp:        { bg: 'var(--brand-soft)', color: 'var(--brand-ink)' },
  lmai:      { bg: 'var(--warn-soft-2)', color: 'var(--warn-strong-2)' },
  accountant:{ bg: 'var(--pink-soft)', color: 'var(--brand-ink)' },
}

const PERM_LEVEL_LABELS: Record<string, string> = {
  owner:          'Владелец (полный доступ)',
  department_head:'Руководитель отдела',
  employee:       'Сотрудник',
  accountant:     'Бухгалтер',
}

// Примечание: этот раздел управляет МЕТАДАННЫМИ роли (название/описание/уровень).
// Права доступа роли (что видит/может делать) — в разделе выше «Доступы по разделам»,
// который сразу заполняет права новой роли (шаблон), избегая deny-all по умолчанию.

export function RolesPanel() {
  const [roles, setRoles]            = useState<RoleRow[]>([])
  const [loading, setLoading]        = useState(true)
  const [reloadKey, setReloadKey]    = useState(0)
  const [editingId, setEditingId]    = useState<string | null>(null)
  const [editForm, setEditForm]      = useState({ label: '', description: '', permissionLevel: 'employee' as 'employee' | 'department_head' })
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    getRoles().then(r => { setRoles(r); setLoading(false) })
  }, [reloadKey])

  const reload = () => setReloadKey(k => k + 1)

  const handleStartEdit = (role: RoleRow) => {
    setEditingId(role.id)
    setEditForm({
      label: role.label,
      description: role.description ?? '',
      permissionLevel: (role.permission_level === 'department_head' ? 'department_head' : 'employee') as 'employee' | 'department_head',
    })
  }

  const handleSaveEdit = (role: RoleRow) => {
    startTransition(async () => {
      const r = await updateRole(
        role.id,
        editForm.label,
        editForm.description,
        role.is_system ? undefined : editForm.permissionLevel,
      )
      if (r.success) {
        toast.success('Роль обновлена')
        setEditingId(null)
        reload()
      } else toast.error(r.error)
    })
  }

  const handleDelete = (role: RoleRow) => {
    if (!confirm(`Удалить роль «${role.label}»? Действие необратимо.`)) return
    startTransition(async () => {
      const r = await deleteRole(role.id)
      if (r.success) {
        toast.success('Роль удалена')
        reload()
      } else toast.error(r.error)
    })
  }

  return (
    <SectionCard icon={<ShieldCheck size={15} color="var(--on-brand)" />} title="Роли — название и уровень">
      <p className="text-[11px] mb-4 p-2.5 rounded-lg" style={{ backgroundColor: 'var(--paper-2)', color: 'var(--ink-2)' }}>
        Здесь редактируются название/описание/уровень роли. <b>Создание новой роли</b> —
        в разделе «Доступы по разделам» выше (кнопка «Добавить роль»): роль создаётся
        сразу с полным набором прав, чтобы не осталось роли без доступов.
      </p>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 rounded-xl animate-pulse" style={{ backgroundColor: 'var(--paper-2)' }} />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {roles.map(role => {
            const badge = ROLE_BADGE[role.name] ?? { bg: 'var(--info-soft)', color: 'var(--info)' }
            return (
              <div key={role.id} className="rounded-xl px-3 py-2.5"
                style={{ backgroundColor: 'var(--paper-2)', border: '1px solid var(--line)' }}>
                {editingId === role.id ? (
                  <div className="space-y-2">
                    {/* Системные роли: название заблокировано — оно является идентификатором в employees.role */}
                    {role.is_system ? (
                      <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg" style={{ backgroundColor: 'var(--paper-2)' }}>
                        <span className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>{role.label}</span>
                        <span className="text-[10px]" style={{ color: 'var(--ink-3)' }}>· системная, название нельзя изменить</span>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <Label className="text-[10px] font-semibold text-gray-400 uppercase">Название роли *</Label>
                        <Input value={editForm.label} onChange={e => setEditForm(f => ({ ...f, label: e.target.value }))}
                          className="h-7 rounded-lg text-sm border-gray-200" autoFocus />
                      </div>
                    )}
                    <div className="space-y-1">
                      <Label className="text-[10px] font-semibold text-gray-400 uppercase">Описание обязанностей</Label>
                      <Input value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                        placeholder="Описание..." className="h-7 rounded-lg text-sm border-gray-200"
                        autoFocus={role.is_system} />
                    </div>
                    {!role.is_system && (
                      <div className="space-y-1">
                        <Label className="text-[10px] font-semibold text-gray-400 uppercase">Уровень доступа</Label>
                        <select className="w-full h-7 rounded-lg border border-gray-200 px-2 text-xs bg-white"
                          value={editForm.permissionLevel}
                          onChange={e => setEditForm(f => ({ ...f, permissionLevel: e.target.value as 'employee' | 'department_head' }))}>
                          <option value="employee">Сотрудник</option>
                          <option value="department_head">Руководитель отдела</option>
                        </select>
                      </div>
                    )}
                    <div className="flex gap-1.5 pt-0.5">
                      <Button size="sm" className="h-6 rounded-lg text-xs text-white px-2"
                        style={{ backgroundColor: 'var(--brand)' }} onClick={() => handleSaveEdit(role)} disabled={isPending}>
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
                        <span className="shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: badge.bg, color: badge.color }}>
                          {role.label}
                        </span>
                        <span className="text-[10px]" style={{ color: 'var(--ink-3)' }}>
                          {role.is_system ? 'системная' : (PERM_LEVEL_LABELS[role.permission_level] ?? role.permission_level)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => handleStartEdit(role)}
                          className="p-1 rounded-lg hover:bg-gray-200 transition-colors" disabled={isPending}>
                          <Pencil size={13} style={{ color: 'var(--ink-3)' }} />
                        </button>
                        {!role.is_system && (
                          <button onClick={() => handleDelete(role)}
                            className="p-1 rounded-lg hover:bg-red-100 transition-colors" title="Удалить" disabled={isPending}>
                            <Trash2 size={13} style={{ color: 'var(--bad-border)' }} />
                          </button>
                        )}
                      </div>
                    </div>
                    {role.description ? (
                      <p className="mt-1 text-[11px]" style={{ color: 'var(--ink-3)' }}>{role.description}</p>
                    ) : (
                      <p className="mt-1 text-[11px] italic" style={{ color: 'var(--line-strong)' }}>Описание не задано</p>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}
    </SectionCard>
  )
}

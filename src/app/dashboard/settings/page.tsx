'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { KpiSettingsPanel } from '@/components/dashboard/KpiSettingsPanel'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'
import { Plus, Save, Pencil, Trash2, Settings, Building2, ShieldCheck, CalendarDays, Clock3, Palette, Check, BookOpen, SlidersHorizontal, DollarSign, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { getAuditLog } from '@/actions/audit'
import { auditSectionLabel, type AuditRow } from '@/lib/audit-format'
import {
  getDepartments, createDepartment, updateDepartment, deleteDepartment,
  getRoles, createRole, updateRole, deleteRole,
  getWorkSchedules, createWorkSchedule, updateWorkSchedule, deleteWorkSchedule,
  type DeptRow, type RoleRow, type WorkScheduleRow,
} from '@/actions/settings'
import { ACCENT_PRESETS, ACCENT_COOKIE_NAME, DEFAULT_ACCENT, isAccentId, type AccentId } from '@/lib/accent-theme'

// ─── Вспомогательный компонент секции ─────────────────────────────────────────

function SectionCard({ icon, title, children }: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl overflow-hidden glass">
      <div
        className="flex items-center gap-2.5 px-5 py-4"
        style={{ borderBottom: '1px solid rgba(28,20,22,0.07)' }}
      >
        <div className="flex items-center justify-center w-8 h-8 rounded-xl brand-gradient">
          {icon}
        </div>
        <h2 className="font-semibold text-sm text-foreground">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function AppearancePanel() {
  const [active, setActive] = useState<AccentId>(DEFAULT_ACCENT)

  useEffect(() => {
    const current = document.documentElement.getAttribute('data-accent')
    // eslint-disable-next-line react-hooks/set-state-in-effect -- одноразовая синхронизация с DOM-атрибутом, выставленным сервером до гидратации (тот же паттерн, что useIsMobile)
    if (isAccentId(current ?? undefined)) setActive(current as AccentId)
  }, [])

  const choose = useCallback((id: AccentId) => {
    document.documentElement.setAttribute('data-accent', id)
    document.cookie = `${ACCENT_COOKIE_NAME}=${id}; path=/; max-age=31536000; SameSite=Lax`
    setActive(id)
    toast.success('Акцентный цвет изменён')
  }, [])

  return (
    <SectionCard icon={<Palette size={15} color="var(--on-brand)" />} title="Внешний вид">
      <p className="text-xs text-muted-foreground mb-4">
        Акцентный цвет применяется сразу и сохраняется только на этом устройстве.
      </p>
      <div className="grid grid-cols-5 gap-3">
        {ACCENT_PRESETS.map(p => (
          <button
            key={p.id}
            type="button"
            onClick={() => choose(p.id)}
            className="flex flex-col items-center gap-1.5 group"
            title={p.label}
          >
            <span
              className="relative w-11 h-11 rounded-full flex items-center justify-center transition-transform group-hover:scale-105"
              style={{
                background: `linear-gradient(135deg, ${p.from}, ${p.to})`,
                boxShadow: active === p.id ? `0 0 0 3px var(--background), 0 0 0 5px ${p.from}` : '0 4px 12px -4px rgba(0,0,0,0.2)',
              }}
            >
              {active === p.id && <Check size={16} color="var(--on-brand)" strokeWidth={3} />}
            </span>
            <span className="text-[11px] text-muted-foreground">{p.label}</span>
          </button>
        ))}
      </div>
    </SectionCard>
  )
}

function formatActivityTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

const AUDIT_DOT: Record<string, string> = { create: 'var(--ok-base)', update: 'var(--brand)', delete: 'var(--brand-ink)' }

function RecentActionsPanel() {
  const [items, setItems] = useState<AuditRow[]>([])

  useEffect(() => {
    let alive = true
    const sync = () => {
      // История берётся из audit_logs (server-side, RLS owner-only), поэтому она
      // общая для всех устройств, а не как раньше — из localStorage браузера.
      void getAuditLog(15).then((rows) => {
        if (alive) setItems(rows)
      })
    }
    sync()
    // Пишет сервер, отдельного сигнала об изменении нет — опрашиваем нечасто.
    const id = setInterval(sync, 10000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  return (
    <SectionCard icon={<Clock3 size={15} color="var(--on-brand)" />} title="Последние действия">
      {items.length === 0 ? (
        <div className="rounded-xl px-4 py-5 text-center" style={{ backgroundColor: 'var(--paper-2)', border: '1px solid var(--line-soft)' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Пока нет действий</p>
          <p className="mt-1 text-xs" style={{ color: 'var(--ink-3)' }}>
            Здесь появятся изменения в настройках и сотрудниках.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(item => (
            <div key={item.id} className="flex items-start gap-3 rounded-xl px-3 py-2.5"
              style={{ backgroundColor: 'var(--paper-2)', border: '1px solid var(--line-soft)' }}>
              <div className="mt-1 h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: AUDIT_DOT[item.action] ?? 'var(--brand)' }} />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>{item.summary}</p>
                  <span className="text-[11px] shrink-0" style={{ color: 'var(--ink-3)' }}>
                    {formatActivityTime(item.createdAt)}
                  </span>
                </div>
                <p className="mt-0.5 text-xs truncate" style={{ color: 'var(--ink-muted)' }}>
                  {item.employeeName ?? 'Система'}
                </p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ink-3)' }}>
                  {auditSectionLabel(item.resourceType)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}

// ─── Панель отделов ────────────────────────────────────────────────────────────

function DepartmentsPanel() {
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
        <div className="mb-4 p-3 rounded-xl space-y-2" style={{ backgroundColor: 'var(--paper-2)', border: '1px solid var(--line-soft)' }}>
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
              style={{ backgroundColor: 'var(--paper-2)', border: '1px solid var(--line-soft)' }}>
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

// ─── Панель ролей ──────────────────────────────────────────────────────────────

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

function RolesPanel() {
  const [roles, setRoles]            = useState<RoleRow[]>([])
  const [loading, setLoading]        = useState(true)
  const [reloadKey, setReloadKey]    = useState(0)
  const [editingId, setEditingId]    = useState<string | null>(null)
  const [editForm, setEditForm]      = useState({ label: '', description: '', permissionLevel: 'employee' as 'employee' | 'department_head' })
  const [addingNew, setAddingNew]    = useState(false)
  const [newForm, setNewForm]        = useState({ label: '', description: '', permissionLevel: 'employee' as 'employee' | 'department_head' })
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

  const handleCreate = () => {
    if (!newForm.label.trim()) { toast.error('Введите название роли'); return }
    startTransition(async () => {
      const r = await createRole(newForm.label, newForm.label, newForm.description, newForm.permissionLevel)
      if (r.success) {
        toast.success('Роль добавлена')
        setAddingNew(false)
        setNewForm({ label: '', description: '', permissionLevel: 'employee' })
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
    <SectionCard icon={<ShieldCheck size={15} color="var(--on-brand)" />} title="Роли">
      {addingNew ? (
        <div className="mb-4 p-3 rounded-xl space-y-2" style={{ backgroundColor: 'var(--paper-2)', border: '1px solid var(--line-soft)' }}>
          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ink-3)' }}>Новая роль</p>
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-gray-500">Название роли *</Label>
            <Input value={newForm.label} onChange={e => setNewForm(f => ({ ...f, label: e.target.value }))}
              placeholder="Мобилограф" className="h-8 rounded-lg text-sm border-gray-200" autoFocus />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-gray-500">Описание обязанностей</Label>
            <Input value={newForm.description} onChange={e => setNewForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Что делает этот сотрудник..." className="h-8 rounded-lg text-sm border-gray-200" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-gray-500">Уровень доступа *</Label>
            <select className="w-full h-8 rounded-lg border border-gray-200 px-2 text-sm bg-white"
              value={newForm.permissionLevel}
              onChange={e => setNewForm(f => ({ ...f, permissionLevel: e.target.value as 'employee' | 'department_head' }))}>
              <option value="employee">Сотрудник — видит только свои данные</option>
              <option value="department_head">Руководитель отдела — видит данные своего отдела</option>
            </select>
          </div>
          <div className="flex gap-2 pt-1">
            <Button size="sm" className="h-7 rounded-lg text-xs text-white" style={{ backgroundColor: 'var(--brand)' }}
              onClick={handleCreate} disabled={isPending}>
              <Save size={12} className="mr-1" /> Создать роль
            </Button>
            <Button variant="ghost" size="sm" className="h-7 rounded-lg text-xs"
              onClick={() => setAddingNew(false)} disabled={isPending}>Отмена</Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="mb-4 h-8 rounded-xl gap-1.5 text-xs"
          style={{ borderColor: 'var(--brand)', color: 'var(--brand)' }} onClick={() => setAddingNew(true)}>
          <Plus size={13} /> Добавить роль
        </Button>
      )}

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 rounded-xl animate-pulse" style={{ backgroundColor: 'var(--paper-2)' }} />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {roles.map(role => {
            const badge = ROLE_BADGE[role.name] ?? { bg: 'var(--paper)', color: 'var(--brand-ink)' }
            return (
              <div key={role.id} className="rounded-xl px-3 py-2.5"
                style={{ backgroundColor: 'var(--paper-2)', border: '1px solid var(--line-soft)' }}>
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

// ─── WorkSchedulesPanel ───────────────────────────────────────────────────────

function WorkSchedulesPanel() {
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
        <div className="mb-4 p-3 rounded-xl space-y-2" style={{ backgroundColor: 'var(--paper-2)', border: '1px solid var(--line-soft)' }}>
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
              style={{ backgroundColor: 'var(--paper-2)', border: '1px solid var(--line-soft)' }}>
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
                        style={{ backgroundColor: 'var(--paper)', color: 'var(--brand-ink)' }}>{s.name}</span>
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

// ─── Главная страница ─────────────────────────────────────────────────────────

// Отдельные страницы настроек. Часть из них повторяет панели ниже (отделы,
// графики, KPI) — они вынесены на свои адреса, чтобы на них можно было дать
// прямую ссылку; часть существует только там: матрица прав, словарь терминов
// и сведения об окружении.
const SUBPAGES = [
  { href: '/dashboard/settings/roles',       icon: ShieldCheck,       title: 'Роли и доступы',   desc: 'Матрица прав: кто что видит, создаёт, меняет и удаляет' },
  { href: '/dashboard/settings/glossary',    icon: BookOpen,          title: 'Словарь терминов', desc: 'Что значат термины системы — простыми словами' },
  { href: '/dashboard/settings/general',     icon: SlidersHorizontal, title: 'Общее',            desc: 'Сведения о системе и окружении' },
  { href: '/dashboard/settings/departments', icon: Building2,         title: 'Отделы',           desc: 'Структура компании отдельной страницей' },
  { href: '/dashboard/settings/schedules',   icon: CalendarDays,      title: 'Графики работы',   desc: 'Справочник рабочих графиков' },
  { href: '/dashboard/settings/kpi',         icon: DollarSign,        title: 'KPI и оплата',     desc: 'Оклады, бонусы и KPI-пункты по ролям' },
] as const

function SubpagesRow() {
  return (
    <div className="p-5 grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))' }}>
      {SUBPAGES.map(({ href, icon: Icon, title, desc }) => (
        <Link
          key={href}
          href={href}
          className="card-hover flex items-start gap-3 rounded-2xl px-4 py-3.5"
          style={{ border: '1px solid var(--line)', background: 'var(--surface)' }}
        >
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
            style={{ background: 'var(--brand-soft)' }}
            aria-hidden
          >
            <Icon size={16} style={{ color: 'var(--brand-ink)' }} />
          </span>
          <span className="min-w-0">
            <b className="block text-[13px]" style={{ color: 'var(--ink)' }}>{title}</b>
            <small className="mt-0.5 block text-[11.5px]" style={{ color: 'var(--ink-3)' }}>{desc}</small>
          </span>
          <ChevronRight size={15} className="ml-auto shrink-0 self-center" style={{ color: 'var(--ink-4)' }} aria-hidden />
        </Link>
      ))}
    </div>
  )
}

export default function SettingsPage() {
  return (
    <div className="min-h-screen">
      <div className="flex items-center gap-3 px-6 py-4 glass-dark text-white">
        <div className="flex items-center justify-center w-9 h-9 rounded-xl brand-gradient">
          <Settings size={18} color="var(--on-brand)" />
        </div>
        <div>
          <div className="font-semibold text-base leading-tight">Настройки</div>
          <div className="text-xs" style={{ color: 'var(--neutral-line-2)' }}>Управление системой</div>
        </div>
      </div>

      <SubpagesRow />

      <div className="p-5 pt-0 grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <AppearancePanel />
          <KpiSettingsPanel />
        </div>
        <div className="space-y-5">
          <RecentActionsPanel />
          <DepartmentsPanel />
          <WorkSchedulesPanel />
          <RolesPanel />
        </div>
      </div>
    </div>
  )
}

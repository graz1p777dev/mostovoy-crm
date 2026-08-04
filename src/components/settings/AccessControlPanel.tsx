'use client'

import { useEffect, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Save, Plus, Lock, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import {
  getRolesForAccessPanel, getPermissionsForRole, savePermissionsForRole,
  createRoleWithPermissions,
  type RoleOption, type PermissionRowUI,
} from '@/actions/access-control'
import { ALL_SECTIONS, SECTION_LABELS } from '@/lib/access-control-constants'
import type { Scope } from '@/lib/authz'
import { SectionCard } from './SectionCard'

const SCOPE_LABELS: Record<Scope, string> = { own: 'Свои', team: 'Отдел', all: 'Все' }

export function AccessControlPanel() {
  const [roles, setRoles]         = useState<RoleOption[]>([])
  const [activeRoleId, setActiveRoleId] = useState<string | null>(null)
  const [rows, setRows]           = useState<PermissionRowUI[]>([])
  const [loadingRoles, setLoadingRoles] = useState(true)
  const [loadingRows, setLoadingRows]   = useState(false)
  const [dirty, setDirty]         = useState(false)
  const [isPending, startTransition] = useTransition()
  const [addingRole, setAddingRole] = useState(false)
  const [newRole, setNewRole] = useState({ label: '', permissionLevel: 'employee' as 'employee' | 'department_head', templateRoleId: '' })

  // Реюзабельная функция для явной перезагрузки из обработчиков событий (не из эффекта) —
  // например, после создания новой роли.
  const loadRoles = () => {
    setLoadingRoles(true)
    getRolesForAccessPanel().then(list => {
      setRoles(list)
      setLoadingRoles(false)
      setActiveRoleId(prev => prev ?? (list[0]?.id ?? null))
    })
  }

  // Первичная загрузка — без синхронного setState в теле эффекта (только внутри then).
  useEffect(() => {
    let cancelled = false
    getRolesForAccessPanel().then(list => {
      if (cancelled) return
      setRoles(list)
      setLoadingRoles(false)
      setActiveRoleId(prev => prev ?? (list[0]?.id ?? null))
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!activeRoleId) return
    let cancelled = false
    getPermissionsForRole(activeRoleId).then(r => {
      if (cancelled) return
      setRows(r)
      setLoadingRows(false)
      setDirty(false)
    })
    return () => { cancelled = true }
  }, [activeRoleId])

  const activeRole = roles.find(r => r.id === activeRoleId)

  const updateRow = (resource: string, patch: Partial<PermissionRowUI>) => {
    setRows(prev => prev.map(r => r.resource === resource ? { ...r, ...patch } : r))
    setDirty(true)
  }

  const handleSave = () => {
    if (!activeRoleId) return
    startTransition(async () => {
      const res = await savePermissionsForRole(activeRoleId, rows)
      if (res.success) {
        toast.success('Доступы сохранены')
        setDirty(false)
      } else {
        toast.error(res.error)
      }
    })
  }

  const handleCreateRole = () => {
    if (!newRole.label.trim()) { toast.error('Введите название роли'); return }
    startTransition(async () => {
      const res = await createRoleWithPermissions({
        label: newRole.label,
        permissionLevel: newRole.permissionLevel,
        templateRoleId: newRole.templateRoleId || undefined,
      })
      if (res.success) {
        toast.success('Роль создана')
        setAddingRole(false)
        setNewRole({ label: '', permissionLevel: 'employee', templateRoleId: '' })
        loadRoles()
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <SectionCard icon={<ShieldCheck size={15} color="var(--on-brand)" />} title="Доступы по разделам">
      <p className="text-xs mb-4" style={{ color: 'var(--ink-3)' }}>
        Права хранятся по каждой роли отдельно. Владелец всегда имеет полный доступ ко всему —
        это встроенная гарантия, не зависящая от настроек здесь.
      </p>

      {/* Вкладки ролей */}
      {loadingRoles ? (
        <div className="flex gap-2 mb-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-8 w-20 rounded-xl animate-pulse" style={{ backgroundColor: 'var(--surface-2)' }} />
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {roles.map(role => {
            const active = role.id === activeRoleId
            return (
              <button
                key={role.id}
                onClick={() => {
                  if (dirty && !confirm('Есть несохранённые изменения. Переключить роль без сохранения?')) return
                  if (role.id !== activeRoleId) setLoadingRows(true)
                  setActiveRoleId(role.id)
                }}
                className="px-3 py-1.5 rounded-xl text-xs font-medium transition-colors"
                style={active
                  ? { backgroundColor: 'var(--brand)', color: 'var(--on-brand)' }
                  : { backgroundColor: 'var(--surface-2)', color: 'var(--ink)' }}
              >
                {role.label}
              </button>
            )
          })}
          <button
            onClick={() => setAddingRole(v => !v)}
            className="px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1"
            style={{ backgroundColor: 'var(--brand-soft)', color: 'var(--brand-ink)' }}
          >
            <Plus size={13} /> Добавить роль
          </button>
        </div>
      )}

      {/* Форма создания роли */}
      {addingRole && (
        <div className="mb-4 p-3 rounded-xl space-y-2" style={{ backgroundColor: 'var(--surface-2)', border: '1px solid var(--line)' }}>
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-gray-500">Название роли *</Label>
            <Input value={newRole.label} onChange={e => setNewRole(f => ({ ...f, label: e.target.value }))}
              placeholder="Например: Оператор склада" className="h-8 rounded-lg text-sm border-gray-200" autoFocus />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-gray-500">Уровень доступа *</Label>
            <select className="w-full h-8 rounded-lg border border-gray-200 px-2 text-sm bg-white"
              value={newRole.permissionLevel}
              onChange={e => setNewRole(f => ({ ...f, permissionLevel: e.target.value as 'employee' | 'department_head' }))}>
              <option value="employee">Сотрудник — свои данные</option>
              <option value="department_head">Руководитель отдела — данные отдела</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-gray-500">Взять права за основу (шаблон)</Label>
            <select className="w-full h-8 rounded-lg border border-gray-200 px-2 text-sm bg-white"
              value={newRole.templateRoleId}
              onChange={e => setNewRole(f => ({ ...f, templateRoleId: e.target.value }))}>
              <option value="">Без прав (всё запрещено, настроить вручную)</option>
              {roles.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </div>
          <div className="flex gap-2 pt-1">
            <Button size="sm" className="h-7 rounded-lg text-xs text-white" style={{ backgroundColor: 'var(--brand)' }}
              onClick={handleCreateRole} disabled={isPending}>
              <Save size={12} className="mr-1" /> Создать роль
            </Button>
            <Button variant="ghost" size="sm" className="h-7 rounded-lg text-xs"
              onClick={() => setAddingRole(false)} disabled={isPending}>Отмена</Button>
          </div>
        </div>
      )}

      {/* Матрица прав */}
      {!activeRole ? null : loadingRows ? (
        <div className="space-y-1.5">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-9 rounded-lg animate-pulse" style={{ backgroundColor: 'var(--surface-2)' }} />
          ))}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="w-full text-xs" style={{ minWidth: 560 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                <th className="text-left py-2 pr-2 font-semibold" style={{ color: 'var(--ink-3)' }}>Раздел</th>
                <th className="text-center py-2 px-1 font-semibold" style={{ color: 'var(--ink-3)' }}>Смотреть</th>
                <th className="text-center py-2 px-1 font-semibold" style={{ color: 'var(--ink-3)' }}>Создавать</th>
                <th className="text-center py-2 px-1 font-semibold" style={{ color: 'var(--ink-3)' }}>Редактировать</th>
                <th className="text-center py-2 px-1 font-semibold" style={{ color: 'var(--ink-3)' }}>Удалять</th>
                <th className="text-center py-2 pl-1 font-semibold" style={{ color: 'var(--ink-3)' }}>Охват</th>
              </tr>
            </thead>
            <tbody>
              {ALL_SECTIONS.map(section => {
                const row = rows.find(r => r.resource === section)
                if (!row) return null
                const isConsultationsDelete = section === 'consultations'
                const ownerRole = activeRole.name === 'owner'
                // Финансы/Инвесторы закрыты жёстко на уровне БД (RLS: только owner/accountant),
                // таблица прав ими не управляет — показываем строку заблокированной, чтобы не
                // вводить в заблуждение, что доступ можно выдать отсюда.
                const hardFinance = section === 'finances' || section === 'investors'
                if (hardFinance && !ownerRole) {
                  return (
                    <tr key={section} style={{ borderBottom: '1px solid var(--line)', opacity: 0.6 }}>
                      <td className="py-1.5 pr-2 font-medium" style={{ color: 'var(--ink)' }}>{SECTION_LABELS[section]}</td>
                      <td colSpan={5} className="py-1.5 text-center">
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded"
                          style={{ backgroundColor: 'var(--surface-2)', color: 'var(--ink-2)' }}
                          title="Финансы доступны только Владельцу и Бухгалтеру — фиксировано на уровне БД, не настраивается">
                          <Lock size={10} /> Фикс.: Владелец / Бухгалтер
                        </span>
                      </td>
                    </tr>
                  )
                }
                return (
                  <tr key={section} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td className="py-1.5 pr-2 font-medium" style={{ color: 'var(--ink)' }}>
                      {SECTION_LABELS[section]}
                    </td>
                    <td className="text-center py-1.5 px-1">
                      <input type="checkbox" checked={row.can_view} disabled={ownerRole}
                        onChange={e => updateRow(section, { can_view: e.target.checked })} />
                    </td>
                    <td className="text-center py-1.5 px-1">
                      <input type="checkbox" checked={row.can_create} disabled={ownerRole}
                        onChange={e => updateRow(section, { can_create: e.target.checked })} />
                    </td>
                    <td className="text-center py-1.5 px-1">
                      <input type="checkbox" checked={row.can_edit} disabled={ownerRole}
                        onChange={e => updateRow(section, { can_edit: e.target.checked })} />
                    </td>
                    <td className="text-center py-1.5 px-1">
                      {isConsultationsDelete && !ownerRole ? (
                        <span
                          className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded"
                          style={{ backgroundColor: 'var(--surface-2)', color: 'var(--ink-2)' }}
                          title="Удаление записей — жёсткая гарантия, доступна только Владельцу и не выдаётся через эту панель"
                        >
                          <Lock size={10} /> Только Владелец
                        </span>
                      ) : (
                        <input type="checkbox" checked={row.can_delete} disabled={ownerRole}
                          onChange={e => updateRow(section, { can_delete: e.target.checked })} />
                      )}
                    </td>
                    <td className="text-center py-1.5 pl-1">
                      <select
                        value={row.scope}
                        disabled={ownerRole}
                        onChange={e => updateRow(section, { scope: e.target.value as Scope })}
                        className="h-6 rounded-md border border-gray-200 text-[11px] bg-white px-1"
                      >
                        {(['own', 'team', 'all'] as Scope[]).map(s => (
                          <option key={s} value={s}>{SCOPE_LABELS[s]}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {activeRole.name === 'owner' ? (
            <p className="text-xs mt-3" style={{ color: 'var(--ink-3)' }}>
              У роли «Владелец» полный доступ всегда — изменить нельзя (встроенная гарантия).
            </p>
          ) : (
            <div className="flex items-center gap-2 mt-4">
              <Button
                size="sm"
                className="h-8 rounded-xl text-xs text-white gap-1.5"
                style={{ backgroundColor: dirty ? 'var(--brand)' : 'var(--ink-4)' }}
                onClick={handleSave}
                disabled={isPending || !dirty}
              >
                <Save size={13} /> Сохранить доступы
              </Button>
              {dirty && <span className="text-[11px]" style={{ color: 'var(--warn-strong)' }}>Есть несохранённые изменения</span>}
            </div>
          )}
        </div>
      )}
    </SectionCard>
  )
}

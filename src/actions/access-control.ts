'use server'

// ─── Панель «Роли и доступы» — читает/пишет таблицу permissions ────────────────
// Доступ к самой панели — ТОЛЬКО owner (и здесь на сервере, и в UI/nav).
// Удаление консультаций — ЖЁСТКОЕ правило: сервер игнорирует can_delete=true для
// 'consultations' у любой роли, кроме owner (см. canDeleteConsultationHardRule в authz.ts).
// Это защита от того, что кто-то по ошибке/умышленно выставит галочку в этой панели —
// на реальное удаление это никак не повлияет, но и хранить обманчивое «true» не даём.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActor, type Section, type Scope } from '@/lib/authz'
import { ALL_SECTIONS } from '@/lib/access-control-constants'

export type ActionResult = { success: true } | { success: false; error: string }

export interface PermissionRowUI {
  resource: Section
  can_view: boolean
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
  scope: Scope
}

export interface RoleOption {
  id: string
  name: string
  label: string
  is_system: boolean
}

async function requireOwner(): Promise<boolean> {
  const actor = await getActor()
  return actor?.role === 'owner'
}

// ─── Список ролей для вкладок ───────────────────────────────────────────────────

export async function getRolesForAccessPanel(): Promise<RoleOption[]> {
  if (!await requireOwner()) return []
  const admin = createAdminClient()
  const { data } = await admin
    .from('roles')
    .select('id, name, label, is_system')
    .is('deleted_at', null)
    .order('is_system', { ascending: false })
    .order('created_at')
  return (data ?? []) as RoleOption[]
}

// ─── Матрица прав выбранной роли (все 16 разделов, недостающие — deny-заглушка) ─

export async function getPermissionsForRole(roleId: string): Promise<PermissionRowUI[]> {
  if (!await requireOwner()) return []
  const admin = createAdminClient()
  const { data } = await admin
    .from('permissions')
    .select('resource, can_view, can_create, can_edit, can_delete, scope')
    .eq('role_id', roleId)

  const byResource = new Map((data ?? []).map(r => [r.resource as string, r]))

  return ALL_SECTIONS.map(section => {
    const row = byResource.get(section)
    return row
      ? {
          resource: section,
          can_view: row.can_view as boolean,
          can_create: row.can_create as boolean,
          can_edit: row.can_edit as boolean,
          can_delete: row.can_delete as boolean,
          scope: row.scope as Scope,
        }
      : { resource: section, can_view: false, can_create: false, can_edit: false, can_delete: false, scope: 'own' as Scope }
  })
}

// ─── Сохранение матрицы прав роли ───────────────────────────────────────────────

export async function savePermissionsForRole(
  roleId: string,
  rows: PermissionRowUI[],
): Promise<ActionResult> {
  if (!await requireOwner()) return { success: false, error: 'Недостаточно прав' }

  const admin = createAdminClient()
  const { data: role } = await admin.from('roles').select('name').eq('id', roleId).maybeSingle()
  if (!role) return { success: false, error: 'Роль не найдена' }

  const sanitized = rows.map(r => ({
    ...r,
    // Жёсткое правило неотключаемо: даже если пришло true — не сохраняем его как true
    // для консультаций у не-owner ролей (реальное удаление всё равно решает сервер-код,
    // но не храним обманчивое значение в таблице).
    can_delete: (r.resource === 'consultations' && role.name !== 'owner') ? false : r.can_delete,
  }))

  const payload = sanitized.map(r => ({
    role_id: roleId,
    resource: r.resource,
    can_view: r.can_view,
    can_create: r.can_create,
    can_edit: r.can_edit,
    can_delete: r.can_delete,
    scope: r.scope,
    updated_at: new Date().toISOString(),
  }))

  const { error } = await admin
    .from('permissions')
    .upsert(payload, { onConflict: 'role_id,resource' })

  if (error) {
    console.error('[savePermissionsForRole]', error.message)
    return { success: false, error: 'Ошибка сохранения прав' }
  }

  revalidatePath('/dashboard/settings')
  return { success: true }
}

// ─── Создание новой роли + сид её прав (по шаблону другой роли или deny-all) ────

export async function createRoleWithPermissions(input: {
  label: string
  permissionLevel: 'employee' | 'department_head'
  templateRoleId?: string
}): Promise<ActionResult> {
  if (!await requireOwner()) return { success: false, error: 'Недостаточно прав' }
  if (!input.label.trim()) return { success: false, error: 'Название роли обязательно' }

  const slug = input.label.trim().toLowerCase()
    .replace(/[а-яё]/g, '') // не пытаемся транслитерировать — просят латиницу для системного имени
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
  const finalSlug = slug || `role_${Date.now()}`

  const admin = createAdminClient()

  // Шаблон прав: копируем из указанной роли, иначе — deny-all по всем разделам.
  let templateRows: PermissionRowUI[] = ALL_SECTIONS.map(section => (
    { resource: section, can_view: false, can_create: false, can_edit: false, can_delete: false, scope: 'own' as Scope }
  ))
  if (input.templateRoleId) {
    const { data: tpl } = await admin
      .from('permissions')
      .select('resource, can_view, can_create, can_edit, can_delete, scope')
      .eq('role_id', input.templateRoleId)
    if (tpl && tpl.length) {
      const byResource = new Map(tpl.map(r => [r.resource as string, r]))
      templateRows = ALL_SECTIONS.map(section => {
        const row = byResource.get(section)
        return row
          ? { resource: section, can_view: row.can_view as boolean, can_create: row.can_create as boolean, can_edit: row.can_edit as boolean, can_delete: row.can_delete as boolean, scope: row.scope as Scope }
          : templateRows.find(r => r.resource === section)!
      })
    }
  }

  // Атомарно: роль + ровно 16 permissions в одной транзакции (RPC, миграция 042).
  // При частичном сиде RPC бросает исключение и откатывает создание роли.
  const { error } = await admin.rpc('create_role_with_permissions', {
    p_name: finalSlug,
    p_label: input.label.trim(),
    p_permission_level: input.permissionLevel,
    p_permissions: templateRows,
  })

  if (error) {
    console.error('[createRoleWithPermissions]', error.code, '|', error.message)
    const msg = error.message || ''
    if (msg.includes('duplicate') || error.code === '23505') {
      return { success: false, error: 'Роль с таким системным именем уже существует' }
    }
    if (msg.includes('incomplete_permissions_seed')) {
      return { success: false, error: 'Ошибка сида прав роли (неполный набор) — роль не создана' }
    }
    return { success: false, error: 'Ошибка создания роли' }
  }

  revalidatePath('/dashboard/settings')
  return { success: true }
}

// ─── Единый серверный слой авторизации (RBAC) ──────────────────────────────────
// Читает таблицу permissions (роль × раздел × can_view/create/edit/delete + scope).
// FAIL-CLOSED: если для роли+раздела нет строки, или запрошенное действие не разрешено —
// доступ ЗАПРЕЩЁН по умолчанию. Импортировать и вызывать can()/getScope() ПЕРЕД любым
// использованием admin-клиента (который обходит RLS) в Server Actions.
//
// Идентичность — через getUser() (валидирует токен у Auth-сервера), НЕ getSession()
// (тот лишь читает cookie без проверки у сервера).

import { getAuthUser, getSelfEmployee, getPermissionsForRole, once } from '@/lib/identity'

export type Section =
  | 'dashboard' | 'consultations' | 'decomposition' | 'salaries' | 'finances'
  | 'marketing' | 'employees' | 'calendar' | 'attendance' | 'tasks'
  | 'notifications' | 'documents' | 'investors' | 'kpi_settings' | 'settings'
  | 'integrations'
  // Отдельно от 'attendance': отпуска утверждает владелец, а табель может вести
  // руководитель отдела. Право делегируемое — получатель нигде не зашит как owner.
  | 'vacations'

export type Action = 'view' | 'create' | 'edit' | 'delete'
export type Scope = 'own' | 'team' | 'all'

export interface Actor {
  userId: string
  employeeId: string
  role: string
  departmentId: string | null
}

interface PermissionRow {
  can_view: boolean
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
  scope: Scope
}

// ─── getActor: надёжная identity + активный сотрудник ─────────────────────────
// Возвращает null, если: не залогинен (getUser провалился), нет строки в employees,
// сотрудник архивирован (status='archived') или мягко удалён (deleted_at).

export async function getActor(): Promise<Actor | null> {
  return once('actor', async (): Promise<Actor | null> => {
  const user = await getAuthUser()
  if (!user) return null

  const emp = await getSelfEmployee()

  // Условия те же, что и раньше (deleted_at фильтровался в самом запросе):
  if (!emp) return null
  if (emp.deleted_at) return null
  if (emp.status === 'archived') return null

  return {
    userId: user.id,
    employeeId: emp.id,
    role: emp.role,
    departmentId: emp.department_id ?? null,
  }
  })
}

// ─── Чтение права из permissions (fail-closed при отсутствии/неоднозначности) ──

async function getPermissionRow(role: string, section: Section): Promise<PermissionRow | null> {
  // Все разделы роли берутся ОДНИМ запросом и мемоизируются на запрос (см. identity.ts).
  // Возврат null при отсутствии роли — как и раньше: роль не найдена/удалена → запрет.
  const all = await getPermissionsForRole(role)
  if (!all) return null

  const rows = all.filter(r => r.resource === section)

  // Отсутствует строка ИЛИ дубликаты (неоднозначность) → fail-closed запрет.
  if (rows.length !== 1) return null

  const row = rows[0]
  const scope = row.scope
  if (scope !== 'own' && scope !== 'team' && scope !== 'all') return null

  return {
    can_view: row.can_view,
    can_create: row.can_create,
    can_edit: row.can_edit,
    can_delete: row.can_delete,
    scope: scope as Scope,
  }
}

// ─── can(actor, section, action): true/false, fail-closed ─────────────────────
// owner ВСЕГДА проходит (permission_level='owner' — управляет всей системой);
// это соответствует существующей семантике ролей (BUSINESS_RULES.md), не «дыра» —
// owner и так имеет 'all'+все галочки во всех строках permissions на сегодня.

export async function can(actor: Actor, section: Section, action: Action): Promise<boolean> {
  if (actor.role === 'owner') return true

  const row = await getPermissionRow(actor.role, section)
  if (!row) return false

  switch (action) {
    case 'view':   return row.can_view
    case 'create': return row.can_create
    case 'edit':   return row.can_edit
    case 'delete': return row.can_delete
  }
}

// ─── getScope(actor, section): 'own'|'team'|'all'|null (null = нет доступа) ────

export async function getScope(actor: Actor, section: Section): Promise<Scope | null> {
  if (actor.role === 'owner') return 'all'
  const row = await getPermissionRow(actor.role, section)
  if (!row || !row.can_view) return null
  return row.scope
}

// ─── Управляющая роль маркетинга: право на company-level мутации ──────────────
// Company-level маркетинг-данные (план каналов, публикации, реестр/типы партнёров,
// пополнения) правит ТОЛЬКО управляющий: marketing.edit со scope 'team'/'all'
// (owner=all, руководитель отдела=team). Рядовой targetolog (scope='own') — НЕТ.
// Зеркалит серверный _assert_marketing_manager (миграция 066), defense-in-depth.

export async function isMarketingManager(actor: Actor): Promise<boolean> {
  if (!await can(actor, 'marketing', 'edit')) return false
  const scope = await getScope(actor, 'marketing')
  return scope === 'team' || scope === 'all'
}

// ─── Управляющий финансов: company-level мутации финансов (категории) ─────────
// Зеркало isMarketingManager для ресурса finances: edit + scope 'team'/'all'.
// На текущем составе это owner и бухгалтер (оба scope=all). Обычные расходы правит
// любой с finances.edit; справочник категорий — только управляющий.
export async function isFinancesManager(actor: Actor): Promise<boolean> {
  if (!await can(actor, 'finances', 'edit')) return false
  const scope = await getScope(actor, 'finances')
  return scope === 'team' || scope === 'all'
}

// ─── inScope: проверка владения конкретной строкой по scope ───────────────────
// ownerEmployeeId — employee_id/manager_id/assigned_to владельца строки (null — общая строка).
// ownerDepartmentId — отдел владельца строки (для team-проверки).

export function inScope(
  actor: Actor,
  scope: Scope,
  ownerEmployeeId: string | null,
  ownerDepartmentId: string | null,
): boolean {
  if (scope === 'all') return true
  if (scope === 'own') return ownerEmployeeId === actor.employeeId
  if (scope === 'team') {
    return ownerEmployeeId === actor.employeeId
      || (actor.departmentId !== null && ownerDepartmentId === actor.departmentId)
  }
  return false
}

// ─── Адаптер Viewer→Actor для модулей, уже использующих getViewer() ────────────
// departmentId не переносится (getViewer его не возвращает) — для can()/getScope() это
// не нужно (только для inScope() при точечной проверке владения строкой).

export function actorFromViewer(viewer: { id: string; role: string }): Actor {
  return { userId: '', employeeId: viewer.id, role: viewer.role, departmentId: null }
}

// ─── ЖЁСТКАЯ ГАРАНТИЯ: удаление консультаций — ТОЛЬКО owner ────────────────────
// Не читает permissions вообще — хардкод, неотключаемый через панель прав.
// Даже если кому-то в таблице выставят can_delete=true на 'consultations',
// эта проверка всё равно вернёт false для всех, кроме owner.

export function canDeleteConsultationHardRule(actor: Actor): boolean {
  return actor.role === 'owner'
}

// Определение текущего пользователя и его уровня доступа.
// Серверный модуль — импортируется только из Server Actions.

import { getAuthUser, getSelfEmployee, getRoleByName, once } from '@/lib/identity'

export interface Viewer {
  id: string
  name: string
  role: string
  permission_level: string
}

// Идентичность берётся из мемоизированных на запрос чтений (см. identity.ts):
// auth.getUser + employees(self) + roles — те же три источника, что и раньше, но
// общие с getActor()/can()/getScope(), поэтому в пределах запроса они выполняются
// по одному разу, а не заново на каждый вызов.
//
// Отличие от прежней версии: строка employees читается admin-клиентом, а не
// user-клиентом. Это своя же строка (RLS-политика employees_select_self_identity
// и так её отдаёт), и getActor() уже читал её именно так — теперь оба используют
// одно чтение вместо двух. Фильтр deleted_at применяется здесь явно.
export async function getViewer(): Promise<Viewer | null> {
  return once('viewer', async (): Promise<Viewer | null> => {
  const user = await getAuthUser()
  if (!user) return null

  const me = await getSelfEmployee()
  if (!me || me.deleted_at) return null

  const roleRow = await getRoleByName(me.role)

  return {
    id:   me.id,
    name: me.name ?? '',
    role: me.role,
    permission_level: roleRow?.permission_level ?? 'employee',
  }
  })
}

export function isManager(viewer: { role: string; permission_level: string }): boolean {
  return viewer.role === 'owner' || viewer.permission_level === 'department_head'
}

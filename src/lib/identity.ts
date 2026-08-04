// ─── Идентичность и права: ОДИН раз за запрос ─────────────────────────────────
//
// ЗАЧЕМ. Каждый round-trip до Supabase стоит ~284 мс (регион ap-northeast-1, Бишкек →
// Токио; исполнение в самой БД 0.15–1.9 мс — см. docs/reports/2026-07-29-perf-audit.md).
// До этого модуля getActor()/getViewer()/can()/getScope() ходили в сеть заново при
// КАЖДОМ вызове, и одна загрузка страницы тратила два десятка round-trip'ов на
// повторный ответ на вопрос «кто этот пользователь?».
//
// Кеш живёт ровно один серверный запрос. Между запросами (в т.ч. между разными
// Server Action POST) его нет — то есть отзыв прав вступает в силу со следующего
// запроса, ровно как и раньше. Семантика авторизации не меняется, меняется только
// число обращений внутри запроса.
//
// ВАЖНО: здесь НЕТ фильтра deleted_at — вызывающие применяют свои условия сами,
// чтобы поведение каждого места осталось прежним (getActor отсекает deleted+archived,
// RootLayout — deleted, DashboardLayout — не отсекает ничего, как и было).

import { cookies } from 'next/headers'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── Request-scope ────────────────────────────────────────────────────────────
// ВАЖНО (проверено замером): React cache() мемоизирует только внутри React-рендера.
// Server Actions выполняются ВНЕ рендера, поэтому там cache() не работает вовсе —
// счётчик обращений показывал #1 на каждом вызове, а auth.getUser уходил в сеть
// дважды за один экшен. Поэтому scope строим на объекте, который Next.js и так
// делает request-scoped: результат cookies(). Он один и тот же в пределах запроса
// и разный между запросами, поэтому WeakMap по нему = кеш ровно на один запрос,
// без TTL и без утечки между пользователями.

type Store = Map<string, Promise<unknown>>
const scopes = new WeakMap<object, Store>()

async function scope(): Promise<Store> {
  const key = (await cookies()) as unknown as object
  let s = scopes.get(key)
  if (!s) { s = new Map(); scopes.set(key, s) }
  return s
}

/** Выполнить fn один раз за запрос под ключом key. */
export async function once<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const s = await scope()
  const hit = s.get(key)
  if (hit) return hit as Promise<T>
  const p = fn()
  s.set(key, p as Promise<unknown>)
  return p
}

// ─── Счётчик обращений за запрос (для проверки эффекта мемоизации) ─────────────

interface IdentityStats { count: number; calls: string[] }

const statsByScope = new WeakMap<object, IdentityStats>()

async function identityStats(): Promise<IdentityStats> {
  const key = (await cookies()) as unknown as object
  let s = statsByScope.get(key)
  if (!s) { s = { count: 0, calls: [] }; statsByScope.set(key, s) }
  return s
}

// В dev логируем всегда — это единственный способ увидеть, сколько обращений за
// идентичностью реально уходит в сеть за один запрос. В production молчим,
// если явно не включён IDENTITY_TRACE=1.
const TRACE = process.env.IDENTITY_TRACE === '1' || process.env.NODE_ENV !== 'production'

async function track(label: string): Promise<void> {
  const s = await identityStats()
  s.count += 1
  s.calls.push(label)
  if (TRACE) {
    console.log(`[identity] RTT #${s.count} — ${label}`)
  }
}

/** Сколько сетевых обращений за идентичностью/правами сделано в текущем запросе. */
export async function identityRoundTrips(): Promise<IdentityStats> {
  const s = await identityStats()
  return { count: s.count, calls: [...s.calls] }
}

// ─── auth.getUser(): один раз за запрос ───────────────────────────────────────
// Это полноценный сетевой вызов к Auth-серверу (~292 мс замерено), а не чтение cookie.

export async function getAuthUser(): Promise<User | null> {
  return once('auth.getUser', async () => {
    await track('auth.getUser')
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user ?? null
  })
}

// ─── Строка employees текущего пользователя: один раз за запрос ────────────────
// Возвращает ВСЕ поля — чтобы одним чтением обслужить RootLayout (select('*')),
// DashboardLayout (must_change_password) и getActor (id/role/department_id/status).

export interface SelfEmployeeRow {
  id: string
  role: string
  department_id: string | null
  status: string | null
  deleted_at: string | null
  must_change_password: boolean | null
  name: string | null
  [key: string]: unknown
}

// Ключ кеша — user_id, поэтому слои, у которых id уже есть из cookie-сессии
// (RootLayout, DashboardLayout), не платят за лишний auth.getUser(), а authz,
// которому нужна ПРОВЕРЕННАЯ идентичность, попадает в ту же запись кеша.
export async function getEmployeeByUserId(userId: string): Promise<SelfEmployeeRow | null> {
  return once(`employees:${userId}`, async () => {
    await track('employees(self)')
    const admin = createAdminClient()
    const { data } = await admin
      .from('employees')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    return (data as SelfEmployeeRow | null) ?? null
  })
}

/**
 * Строка сотрудника для ПРОВЕРЕННОГО пользователя (auth.getUser).
 * Для Server Actions и authz. Слоям с готовой cookie-сессией лучше звать
 * getEmployeeByUserId(session.user.id) — там проверка уже сделана middleware.
 */
export async function getSelfEmployee(): Promise<SelfEmployeeRow | null> {
  const user = await getAuthUser()
  if (!user) return null
  return getEmployeeByUserId(user.id)
}

// ─── Строка roles по имени: один раз за (запрос, роль) ────────────────────────
// Обслуживает и authz.getPermissionRow (нужен id), и decomposition/viewer
// (нужен permission_level) — раньше это были два отдельных обращения.

export interface RoleRow {
  id: string
  permission_level: string | null
}

export async function getRoleByName(roleName: string): Promise<RoleRow | null> {
  return once(`roles:${roleName}`, async () => {
    await track(`roles(${roleName})`)
    const admin = createAdminClient()
    const { data } = await admin
      .from('roles')
      .select('id, permission_level')
      .eq('name', roleName)
      .is('deleted_at', null)
      .maybeSingle()

    if (!data) return null
    return {
      id: data.id as string,
      permission_level: (data.permission_level as string | null) ?? null,
    }
  })
}

// ─── Строки permissions для роли: один раз за (запрос, роль) ──────────────────
// Раньше читалась ОДНА строка на каждый вызов can()/getScope() — то есть одна и та
// же строка прав выбиралась по 2–4 раза подряд. Теперь берём все разделы роли одним
// запросом и раздаём из памяти; fail-closed логика вызывающего не меняется.

export interface RawPermissionRow {
  resource: string
  can_view: boolean
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
  scope: string
}

export async function getPermissionsForRole(roleName: string): Promise<RawPermissionRow[] | null> {
  const roleRow = await getRoleByName(roleName)
  if (!roleRow) return null // роль не найдена/удалена → запрет (как и было)

  return once(`permissions:${roleName}`, async () => {
    await track(`permissions(${roleName})`)
    const admin = createAdminClient()
    const { data } = await admin
      .from('permissions')
      .select('resource, can_view, can_create, can_edit, can_delete, scope')
      .eq('role_id', roleRow.id)

    return (data as RawPermissionRow[] | null) ?? []
  })
}

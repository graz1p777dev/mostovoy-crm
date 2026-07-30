'use server'

import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { validatePassword } from '@/lib/auth-validation'
import { notify } from '@/lib/notifications/notify'

export type ActionResult =
  | { success: true; mustChangePassword?: boolean }
  | { success: false; error: string }

// ─── Брутфорс-защита: in-memory счётчик попыток входа ────────────────────────
// Сбрасывается при рестарте сервера. Для multi-instance — заменить на Upstash Redis.

const loginAttempts = new Map<string, { failures: number; blockedUntil: number }>()
const MAX_FAILURES   = 5
const BLOCK_MS       = 15 * 60 * 1000 // 15 минут

// ─── signIn ───────────────────────────────────────────────────────────────────
// Заменяет прямой вызов supabase.auth.signInWithPassword на клиенте.
// Трекает неудачные попытки и блокирует аккаунт после MAX_FAILURES подряд.

export async function signIn(email: string, password: string): Promise<ActionResult> {
  const key = email.toLowerCase().trim()
  const now = Date.now()
  const record = loginAttempts.get(key)

  if (record && record.blockedUntil > now) {
    const minutes = Math.ceil((record.blockedUntil - now) / 60_000)
    return { success: false, error: `Слишком много попыток. Подождите ${minutes} мин.` }
  }

  const supabase = await createClient()
  // Получаем user прямо из ответа — не создаём второй клиент и не вызываем getSession().
  // Второй createClient() может перезаписать session-cookies через setAll и сломать авторизацию.
  const { data: { user }, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    const failures = (record?.failures ?? 0) + 1
    if (failures >= MAX_FAILURES) {
      loginAttempts.set(key, { failures, blockedUntil: now + BLOCK_MS })
      console.warn(`[auth/signIn] locked: ${key} after ${failures} failures`)
      return {
        success: false,
        error: `Аккаунт заблокирован на 15 мин. из-за множества неудачных попыток.`,
      }
    }
    loginAttempts.set(key, { failures, blockedUntil: 0 })
    return { success: false, error: 'Неверный email или пароль' }
  }

  loginAttempts.delete(key)

  // Проверяем must_change_password через тот же клиент — user.id уже известен из signInWithPassword
  if (user) {
    const { data: emp } = await supabase
      .from('employees')
      .select('must_change_password')
      .eq('user_id', user.id)
      .single()
    if (emp?.must_change_password) {
      return { success: true, mustChangePassword: true }
    }
  }

  return { success: true, mustChangePassword: false }
}

// ─── Вспомогательная: получить origin из запроса ─────────────────────────────

async function getSiteOrigin(): Promise<string> {
  const hdrs = await headers()
  const host   = hdrs.get('host') ?? 'localhost:3000'
  const proto  = hdrs.get('x-forwarded-proto') ?? 'http'
  return `${proto}://${host}`
}

// ─── Проверка: только owner может управлять пользователями ───────────────────

async function requireOwner(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return false
  const { data } = await supabase
    .from('employees')
    .select('role')
    .eq('user_id', session.user.id)
    .single()
  return data?.role === 'owner'
}

// ─── requestPasswordReset ─────────────────────────────────────────────────────
// Отправляет письмо со ссылкой для сброса пароля.
// Доступно без авторизации (пользователь вышел или забыл пароль).

export async function requestPasswordReset(email: string): Promise<ActionResult> {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false, error: 'Укажите корректный email' }
  }

  const supabase = await createClient()
  const origin   = await getSiteOrigin()

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    // Callback обменивает code → session на сервере (ставит cookie),
    // затем редиректит на страницу ввода нового пароля
    redirectTo: `${origin}/auth/callback?next=/auth/reset-password`,
  })

  if (error) {
    console.error('[requestPasswordReset]', error.message)
    // Не раскрываем существует ли email — возвращаем success в любом случае
    // чтобы не давать возможность перебирать email-адреса
  }

  return { success: true }
}

// ─── confirmPasswordReset ─────────────────────────────────────────────────────
// Устанавливает новый пароль для текущего залогиненного пользователя.
// Вызывается ПОСЛЕ того как клиент обменял recovery-код на сессию.

export async function confirmPasswordReset(newPassword: string): Promise<ActionResult> {
  const err = validatePassword(newPassword)
  if (err) return { success: false, error: err }

  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { success: false, error: 'Сессия недействительна. Запросите ссылку повторно.' }

  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) {
    console.error('[confirmPasswordReset]', error.message)
    return { success: false, error: 'Не удалось обновить пароль. Попробуйте ещё раз.' }
  }

  // Завершаем все сессии пользователя на других устройствах.
  // scope:'others' оставляет текущую сессию активной (пользователь остаётся в системе).
  const admin = createAdminClient()
  try {
    await admin.auth.admin.signOut(session.access_token, 'others')
  } catch (e) {
    // Не критично — пароль уже сменён, логируем и продолжаем
    console.warn('[confirmPasswordReset] signOut others:', e)
  }

  return { success: true }
}

// ─── createAuthUser ───────────────────────────────────────────────────────────
// Создаёт пользователя в auth.users через service role key.
// Только owner. Используется из createEmployee.

export async function createAuthUser(
  email: string,
  password: string,
  employeeId: string,
): Promise<ActionResult> {
  if (!await requireOwner()) return { success: false, error: 'Недостаточно прав' }

  const pwErr = validatePassword(password)
  if (pwErr) return { success: false, error: pwErr }

  const admin = createAdminClient()

  // Проверяем — вдруг уже есть
  const { data: existing } = await admin.auth.admin.listUsers()
  const alreadyExists = existing?.users?.find(u => u.email === email)
  if (alreadyExists) {
    // Привязываем существующего к employee
    const { error: linkErr } = await admin
      .from('employees')
      .update({ user_id: alreadyExists.id })
      .eq('id', employeeId)
    if (linkErr) return { success: false, error: 'Ошибка привязки аккаунта' }
    return { success: true }
  }

  // Создаём нового пользователя в auth.users
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,   // сразу подтверждаем email, не ждём подтверждения
  })

  if (createErr || !created?.user) {
    console.error('[createAuthUser]', createErr?.message)
    return { success: false, error: 'Ошибка создания аккаунта' }
  }

  // Привязываем auth.users.id → employees.user_id
  const { error: linkErr } = await admin
    .from('employees')
    .update({ user_id: created.user.id })
    .eq('id', employeeId)

  if (linkErr) {
    console.error('[createAuthUser] link error', linkErr.message)
    // Откатываем — удаляем только что созданного пользователя
    await admin.auth.admin.deleteUser(created.user.id)
    return { success: false, error: 'Ошибка привязки аккаунта к сотруднику' }
  }

  return { success: true }
}

// ─── deleteAuthUser ───────────────────────────────────────────────────────────
// Удаляет пользователя из auth.users при архивации сотрудника.
// Только owner.

export async function deleteAuthUser(userId: string): Promise<ActionResult> {
  if (!await requireOwner()) return { success: false, error: 'Недостаточно прав' }

  const admin = createAdminClient()
  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) {
    console.error('[deleteAuthUser]', error.message)
    return { success: false, error: 'Ошибка удаления аккаунта' }
  }
  return { success: true }
}

// ─── changePasswordForce ──────────────────────────────────────────────────────
// Принудительная смена пароля при первом входе.
// Обновляет пароль и снимает флаг must_change_password.

export async function changePasswordForce(newPassword: string): Promise<ActionResult> {
  const err = validatePassword(newPassword)
  if (err) return { success: false, error: err }

  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { success: false, error: 'Сессия недействительна. Войдите заново.' }

  const { error: pwErr } = await supabase.auth.updateUser({ password: newPassword })
  if (pwErr) {
    console.error('[changePasswordForce] updateUser:', pwErr.message)
    return { success: false, error: 'Не удалось обновить пароль. Попробуйте ещё раз.' }
  }

  // Снимаем флаг через admin (обходим RLS — пользователь не имеет права писать сам себе этот флаг)
  const admin = createAdminClient()
  const { data: emp, error: flagErr } = await admin
    .from('employees')
    .update({ must_change_password: false })
    .eq('user_id', session.user.id)
    .select('name')
    .single()

  if (flagErr) {
    console.error('[changePasswordForce] flag clear:', flagErr.message)
    // Не фатально — пароль уже сменён, флаг попробуем сбросить при следующем входе
  }

  void notify({
    type: 'security',
    title: 'Пароль аккаунта изменён',
    body: emp?.name ? `Сотрудник «${emp.name}» сменил пароль` : 'Пароль сотрудника изменён',
    isImportant: true,
  })

  return { success: true }
}

// ─── updateOwnProfile ──────────────────────────────────────────────────────────
// Пользователь редактирует свои контактные данные (имя, телефон, email).
// Не трогает auth.users.email (вход в систему) — это отдельная сущность,
// требующая подтверждения по почте, а SMTP на проде не настроен (см. HANDOFF.md §3).

export type UpdateProfileResult =
  | { success: true; employee: { name: string; phone: string | null; email: string } }
  | { success: false; error: string }

export async function updateOwnProfile(fields: {
  name: string
  phone: string
  email: string
}): Promise<UpdateProfileResult> {
  const name = fields.name.trim()
  const phone = fields.phone.trim()
  const email = fields.email.trim()

  if (!name) return { success: false, error: 'Укажите имя' }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false, error: 'Укажите корректный email' }
  }

  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { success: false, error: 'Сессия недействительна. Войдите заново.' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('employees')
    .update({ name, phone: phone || null, email })
    .eq('user_id', session.user.id)

  if (error) {
    console.error('[updateOwnProfile]', error.message)
    return { success: false, error: 'Не удалось сохранить изменения' }
  }

  return { success: true, employee: { name, phone: phone || null, email } }
}

// ─── changeOwnPassword ─────────────────────────────────────────────────────────
// Пользователь меняет свой пароль из профиля (не форс-флоу первого входа).

export async function changeOwnPassword(newPassword: string): Promise<ActionResult> {
  const err = validatePassword(newPassword)
  if (err) return { success: false, error: err }

  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { success: false, error: 'Сессия недействительна. Войдите заново.' }

  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) {
    console.error('[changeOwnPassword]', error.message)
    return { success: false, error: 'Не удалось обновить пароль. Попробуйте ещё раз.' }
  }

  return { success: true }
}

// ─── UUID-валидация ───────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ─── getImpersonationState ────────────────────────────────────────────────────
// Читает cookie impersonate_as (httpOnly) на сервере.
// Возвращает данные сотрудника из БД — никогда не доверяет содержимому cookie.
// Если employeeId не существует в БД — автоматически удаляет cookie.

export async function getImpersonationState(): Promise<{ id: string; name: string; role: string } | null> {
  const { cookies } = await import('next/headers')
  const jar = await cookies()
  const employeeId = jar.get('impersonate_as')?.value

  if (!employeeId) return null

  // Защита от подделки: принимаем только корректный UUID
  if (!UUID_RE.test(employeeId)) {
    jar.delete('impersonate_as')
    return null
  }

  // Права и имя — только из БД, cookie хранит лишь ID
  const admin = createAdminClient()
  const { data: emp } = await admin
    .from('employees')
    .select('id, name, role')
    .eq('id', employeeId)
    .is('deleted_at', null)
    .single()

  if (!emp) {
    // Несуществующий или удалённый сотрудник — сбрасываем сессию
    jar.delete('impersonate_as')
    return null
  }

  return { id: emp.id, name: emp.name, role: emp.role }
}

// ─── startImpersonation ───────────────────────────────────────────────────────
// Владелец входит «от имени» сотрудника.
// Cookie хранит ТОЛЬКО UUID сотрудника. httpOnly: true — JS не может прочитать.

export async function startImpersonation(employeeId: string): Promise<ActionResult> {
  if (!UUID_RE.test(employeeId)) return { success: false, error: 'Некорректный идентификатор' }

  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { success: false, error: 'Не авторизован' }

  const admin = createAdminClient()

  // Параллельно проверяем owner-роль и загружаем данные цели — экономим один round-trip
  const [selfResult, targetResult] = await Promise.all([
    supabase.from('employees').select('id, role').eq('user_id', session.user.id).single(),
    admin.from('employees').select('id, name, email, role').eq('id', employeeId).is('deleted_at', null).single(),
  ])

  const self   = selfResult.data
  const target = targetResult.data

  if (self?.role !== 'owner')  return { success: false, error: 'Недостаточно прав' }
  if (!target)                 return { success: false, error: 'Сотрудник не найден' }
  if (target.role === 'owner') return { success: false, error: 'Нельзя войти от имени владельца' }

  // Пишем лог и ставим cookie параллельно
  const { cookies } = await import('next/headers')
  const [jar] = await Promise.all([
    cookies(),
    admin.from('audit_logs').insert({
      employee_id:   self.id,
      action:        'impersonation_start',
      resource_type: 'employee',
      resource_id:   employeeId,
      new_data:      { target_name: target.name, target_email: target.email, target_role: target.role },
    }),
  ])

  jar.set('impersonate_as', employeeId, {
    path:     '/',
    sameSite: 'strict',
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    maxAge:   60 * 60 * 4,
  })

  return { success: true }
}

// ─── stopImpersonation ────────────────────────────────────────────────────────

export async function stopImpersonation(): Promise<ActionResult> {
  const supabase = await createClient()
  const { cookies } = await import('next/headers')

  // Параллельно: сессия + cookie jar
  const [{ data: { session } }, jar] = await Promise.all([
    supabase.auth.getSession(),
    cookies(),
  ])
  if (!session) return { success: false, error: 'Не авторизован' }

  const admin      = createAdminClient()
  const employeeId = jar.get('impersonate_as')?.value

  // Параллельно: owner-роль + данные цели для лога
  const [selfResult, targetResult] = await Promise.all([
    supabase.from('employees').select('id, role').eq('user_id', session.user.id).single(),
    employeeId && UUID_RE.test(employeeId)
      ? admin.from('employees').select('name, role').eq('id', employeeId).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const self   = selfResult.data
  const target = (targetResult as { data: { name: string; role: string } | null }).data

  if (self?.role !== 'owner') return { success: false, error: 'Недостаточно прав' }

  if (self && employeeId && UUID_RE.test(employeeId)) {
    await admin.from('audit_logs').insert({
      employee_id:   self.id,
      action:        'impersonation_end',
      resource_type: 'employee',
      resource_id:   employeeId,
      new_data:      target ? { target_name: target.name, target_role: target.role } : {},
    })
  }

  jar.delete('impersonate_as')
  return { success: true }
}

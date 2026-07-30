'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type DeleteAccountResult = { success: true } | { success: false; error: string }

const DELETE_CONFIRMATION = 'my time has come'

export async function deleteOwnAccount(password: string, confirmation: string): Promise<DeleteAccountResult> {
  if (confirmation !== DELETE_CONFIRMATION) return { success: false, error: 'Введите фразу подтверждения полностью и вручную.' }
  if (!password) return { success: false, error: 'Введите текущий пароль.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return { success: false, error: 'Сессия недействительна. Войдите заново.' }

  // Повторная авторизация не позволяет удалить аккаунт, зная только открытую сессию.
  const { data: verified, error: passwordError } = await supabase.auth.signInWithPassword({ email: user.email, password })
  if (passwordError || verified.user?.id !== user.id) return { success: false, error: 'Текущий пароль неверный.' }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return { success: false, error: 'Сервис удаления аккаунтов временно недоступен.' }
  }

  const { data: employee, error: employeeError } = await admin
    .from('employees').select('id, role, deleted_at, status').eq('user_id', user.id).maybeSingle()
  if (employeeError || !employee || employee.deleted_at) return { success: false, error: 'Профиль сотрудника не найден.' }

  if (employee.role === 'owner') {
    const { count, error: ownersError } = await admin
      .from('employees').select('id', { count: 'exact', head: true }).eq('role', 'owner').is('deleted_at', null)
    if (ownersError || (count ?? 0) < 2) return { success: false, error: 'Нельзя удалить последнего владельца. Сначала назначьте другого владельца.' }
  }

  // Операционная история остаётся в базе: профиль архивируется, auth-аккаунт удаляется.
  const { error: archiveError } = await admin
    .from('employees').update({ deleted_at: new Date().toISOString(), status: 'archived' }).eq('id', employee.id)
  if (archiveError) return { success: false, error: 'Не удалось подготовить удаление профиля.' }

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id)
  if (deleteError) {
    await admin.from('employees').update({ deleted_at: null, status: employee.status }).eq('id', employee.id)
    console.error('[deleteOwnAccount]', deleteError.message)
    return { success: false, error: 'Не удалось удалить аккаунт. Профиль восстановлен.' }
  }

  await supabase.auth.signOut()
  return { success: true }
}

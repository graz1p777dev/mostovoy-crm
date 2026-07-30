// ─── notify() ──────────────────────────────────────────────────────────────
// Единая точка записи в public.notifications. Вызывается и из Server Actions/
// Route Handlers этого приложения (смена пароля, нагрузка сервера), и из
// внешних систем через POST /api/internal/notify (бот, деплой-скрипт).
//
// Никогда не бросает исключение наружу — уведомление не должно ронять
// основной поток (смену пароля, ответ API статуса сервера и т.д.).

import { createAdminClient } from '@/lib/supabase/admin'

export type NotificationType =
  | 'kpi_alert'
  | 'kpi_success'
  | 'plan_100'
  | 'absence'
  | 'salary_ready'
  | 'finance_alert'
  | 'system'
  | 'sale'
  | 'consultation_booked'
  | 'consultation_reminder'
  | 'sale_lead'
  | 'server_load'
  | 'deploy'
  | 'security'
  | 'audit'

export interface NotifyInput {
  type: NotificationType
  title: string
  body?: string
  actionUrl?: string
  isImportant?: boolean
  sourceType?: string
  sourceId?: string
  /** Если не задано — уходит всем сотрудникам с ролью owner. */
  employeeIds?: string[]
}

export async function notify(input: NotifyInput): Promise<void> {
  try {
    const admin = createAdminClient()

    let employeeIds = input.employeeIds
    if (!employeeIds) {
      const { data, error } = await admin.from('employees').select('id').eq('role', 'owner')
      if (error) throw error
      employeeIds = (data ?? []).map(e => e.id as string)
    }
    if (employeeIds.length === 0) return

    const { error } = await admin.from('notifications').insert(
      employeeIds.map(employee_id => ({
        employee_id,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        action_url: input.actionUrl ?? null,
        is_important: input.isImportant ?? false,
        source_type: input.sourceType ?? null,
        source_id: input.sourceId ?? null,
      }))
    )
    if (error) throw error
  } catch (err) {
    console.error('[notify] failed to insert notification:', err)
  }
}

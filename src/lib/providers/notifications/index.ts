// ─── Provider: Уведомления ────────────────────────────────────────────────────
// Ответственность: события системы, напоминания, алерты.
//
// Подключение:
//   Supabase таблица `notifications`
//   Realtime: supabase.channel('notifications').on('INSERT', ...)
//   Env: уже настроено

import type { ISODateTimeString } from '@/lib/models/common'

export type NotificationKind =
  | 'lead_assigned'
  | 'appointment_reminder'
  | 'plan_alert'
  | 'payment_received'
  | 'system'

export interface NotificationRaw {
  id:          string
  employee_id: string
  kind:        NotificationKind
  title:       string
  body:        string
  is_read:     boolean
  created_at:  ISODateTimeString
}

export async function fetchUnread(
  _employeeId: string,  // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<NotificationRaw[]> {
  return []
}

export async function markRead(
  _id: string,  // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<void> {
  // TODO: UPDATE notifications SET is_read = true WHERE id = _id
}

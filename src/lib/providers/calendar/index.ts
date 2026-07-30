// ─── Provider: Календарь ──────────────────────────────────────────────────────
// Ответственность: расписание встреч, рабочие дни, слоты.
//
// Подключение:
//   Supabase таблица `consultations` (date, time_slot, manager_id, status)
//   Опционально: Google Calendar API (двусторонняя синхронизация)
//   Env (будущие): GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET

import type { ISODateString, ISODateTimeString } from '@/lib/models/common'

export interface CalendarSlotRaw {
  id:          string
  date:        ISODateString
  time:        string            // 'HH:mm'
  employee_id: string
  client_name: string
  status:      'scheduled' | 'confirmed' | 'done' | 'cancelled'
  created_at:  ISODateTimeString
}

export async function fetchSlots(
  _from:       ISODateString,  // eslint-disable-line @typescript-eslint/no-unused-vars
  _to:         ISODateString,  // eslint-disable-line @typescript-eslint/no-unused-vars
  _employeeId?: string,        // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<CalendarSlotRaw[]> {
  return []
}

export async function fetchWorkingDays(
  _year:  number,  // eslint-disable-line @typescript-eslint/no-unused-vars
  _month: number,  // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<ISODateString[]> {
  // TODO: вернуть рабочие дни по производственному календарю Кыргызстана
  return []
}

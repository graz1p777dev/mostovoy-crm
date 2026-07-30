// ─── Provider: Записи клиентов (Consultations) ───────────────────────────────
// Ответственность: ФВ, консультации, статусы визитов.
//
// Подключение:
//   Supabase таблица `consultations`
//   Клиент: createAdminClient() — обходит RLS для агрегации
//   Env: уже настроено (SUPABASE_SERVICE_ROLE_KEY)

import type { ISODateString } from '@/lib/models/common'

export interface RecordRaw {
  id:             string
  date:           ISODateString
  client_name:    string
  manager_id:     string
  actual_status:  'Пришла' | 'Не пришла' | 'Перенос' | null
  is_nv:          boolean
  amount:         number | null
  created_at:     ISODateString
}

export interface RecordsDailyStats {
  date:    ISODateString
  fv:      number    // actual_status = 'Пришла'
  bezNV:   number    // is_nv = false И пришла
  noShow:  number    // actual_status = 'Не пришла'
}

export async function fetchDailyStats(
  _from: ISODateString,  // eslint-disable-line @typescript-eslint/no-unused-vars
  _to:   ISODateString,  // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<RecordsDailyStats[]> {
  // TODO Шаг 3:
  //   const admin = createAdminClient()
  //   admin.from('consultations')
  //     .select('date, actual_status, is_nv')
  //     .gte('date', from).lte('date', to)
  //     .is('deleted_at', null)
  return []
}

export async function fetchAll(
  _from: ISODateString,  // eslint-disable-line @typescript-eslint/no-unused-vars
  _to:   ISODateString,  // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<RecordRaw[]> {
  return []
}

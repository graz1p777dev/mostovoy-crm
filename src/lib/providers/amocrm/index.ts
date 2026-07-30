// ─── Provider: amoCRM ─────────────────────────────────────────────────────────
// Единственная точка входа для данных из amoCRM.
// Ответственность: получение лидов, обращений, сделок, воронки.
//
// Подключение (Шаг 3):
//   API: https://www.amocrm.ru/developers/content/crm_platform/leads-api
//   Auth: OAuth 2.0, refresh_token → access_token
//   Env: AMOCRM_DOMAIN, AMOCRM_ACCESS_TOKEN, AMOCRM_PIPELINE_ID
//
// Каждая функция = один запрос к API или кеш Redis.
// Services НЕ делают HTTP — они вызывают только эти функции.

import type { ISODateString } from '@/lib/models/common'

// ── Сырые типы amoCRM (не Models — UI их не видит) ───────────────────────────

export interface AmoCrmLead {
  id:          number
  name:        string
  status_id:   number
  pipeline_id: number
  created_at:  number    // unix timestamp
  price:       number
  responsible_user_id: number
}

export interface AmoCrmDailyStats {
  date:        ISODateString
  appeals:     number    // новые обращения
  leads:       number    // квалифицированные лиды
  nv:          number    // назначенные встречи (статус воронки)
}

// ── Стабы → заменить на fetch к API ──────────────────────────────────────────

export async function fetchDailyStats(
  _from: ISODateString,  // eslint-disable-line @typescript-eslint/no-unused-vars
  _to:   ISODateString,  // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<AmoCrmDailyStats[]> {
  // TODO Шаг 3: GET /api/v4/leads?filter[created_at][from]=...&filter[created_at][to]=...
  return []
}

export async function fetchLeads(
  _from: ISODateString,  // eslint-disable-line @typescript-eslint/no-unused-vars
  _to:   ISODateString,  // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<AmoCrmLead[]> {
  // TODO Шаг 3: GET /api/v4/leads с пагинацией
  return []
}

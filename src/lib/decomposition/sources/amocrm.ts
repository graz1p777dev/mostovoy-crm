// ─── Источник: amoCRM ─────────────────────────────────────────────────────────
// Отсюда в будущем будут приходить:
//   - Обращения (appeals) — новые лиды из amoCRM
//   - Квалифицированные лиды (leads)
//   - Назначенные встречи (nv) — стадия воронки «Встреча назначена»
//
// Подключение: amoCRM REST API v4
//   GET /api/v4/leads?filter[pipeline_id]=...&filter[status_id]=...
//   Авторизация: OAuth 2.0 (access_token в .env)
//
// Переменные окружения (добавить в .env.local):
//   AMOCRM_DOMAIN=your-company.amocrm.ru
//   AMOCRM_ACCESS_TOKEN=...
//   AMOCRM_PIPELINE_ID=...

export interface AmoCrmDailyMetrics {
  date: string    // 'yyyy-MM-dd'
  appeals: number
  leads: number
  nv: number
}

// Заглушка — будет заменена на реальный fetch
export async function fetchAmoCrmMetrics(
  _year: number,  // eslint-disable-line @typescript-eslint/no-unused-vars
  _month: number, // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<AmoCrmDailyMetrics[]> {
  return []
}

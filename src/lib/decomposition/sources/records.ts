// ─── Источник: Записи клиентов (Consultations) ───────────────────────────────
// Отсюда в будущем будут приходить:
//   - Факт встречи (fv) — actual_status = 'Пришла'
//   - Консультации без НВ (bezNV) — is_nv = true
//
// Подключение: Supabase таблица `consultations`
//   SELECT date, actual_status, is_nv, manager_id
//   WHERE date BETWEEN period_start AND period_end
//   AND deleted_at IS NULL
//
// Используется: createAdminClient() в Server Action

export interface RecordsDailyMetrics {
  date: string   // 'yyyy-MM-dd'
  fv: number
  bezNV: number
}

// Заглушка — будет заменена на Server Action getConsultationMetrics()
export async function fetchRecordsMetrics(
  _year: number,  // eslint-disable-line @typescript-eslint/no-unused-vars
  _month: number, // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<RecordsDailyMetrics[]> {
  return []
}

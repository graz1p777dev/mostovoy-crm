// ─── Источник: AI-обработка обращений ────────────────────────────────────────
// Отсюда в будущем будут приходить:
//   - Автоматически классифицированные обращения
//   - Скоринг лидов (вероятность покупки)
//   - Рекомендации менеджерам
//
// Подключение: внутренний AI-сервис МОСТОВОЙ
//   POST /api/ai/classify-appeal
//   Авторизация: API Key в .env
//
// Переменные окружения:
//   AI_SERVICE_URL=...
//   AI_SERVICE_KEY=...

export interface AiClassification {
  appealId: string
  isLead: boolean
  score: number   // 0..1
  reason: string
}

// Заглушка — будет заменена на реальный fetch
export async function fetchAiClassifications(
  _year: number,  // eslint-disable-line @typescript-eslint/no-unused-vars
  _month: number, // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<AiClassification[]> {
  return []
}

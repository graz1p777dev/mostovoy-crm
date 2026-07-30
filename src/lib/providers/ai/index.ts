// ─── Provider: AI ─────────────────────────────────────────────────────────────
// Ответственность: классификация обращений, скоринг лидов, рекомендации.
//
// Подключение:
//   Внутренний AI-сервис МОСТОВОЙ
//   POST /api/ai/classify
//   Auth: Bearer API Key
//   Env: AI_SERVICE_URL, AI_SERVICE_KEY
//
// В будущем — Claude API (claude-haiku-4-5-20251001) для быстрых классификаций.

export interface AiClassificationResult {
  appealId:   string
  isLead:     boolean        // квалифицированный лид или нет
  score:      number         // 0..1 вероятность конверсии
  reason:     string         // человекочитаемое объяснение
  suggestion: string         // рекомендация менеджеру
}

export interface AiInsight {
  type:    'warning' | 'opportunity' | 'info'
  title:   string
  body:    string
  metric?: string            // связанная метрика ('conv_fv_sale', 'avg_check', ...)
}

export async function classifyAppeals(
  _appealIds: string[],  // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<AiClassificationResult[]> {
  return []
}

export async function getMonthlyInsights(
  _year:  number,  // eslint-disable-line @typescript-eslint/no-unused-vars
  _month: number,  // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<AiInsight[]> {
  // TODO: анализ трендов и аномалий за месяц, генерация рекомендаций
  return []
}

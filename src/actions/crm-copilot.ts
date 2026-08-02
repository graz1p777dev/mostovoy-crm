'use server'

import { mostovoyFetch } from '@/lib/mostovoy-api'

export type CrmCopilotResult =
  | { success: true; reply: string }
  | { success: false; error: string }

// CRM раньше ходила к снятому FastAPI-сервису. Используем тот же живой AI-шлюз
// витрины, что отвечает покупателям, но с отдельной ролью офисного помощника.
export async function askCrmCopilot(message: string): Promise<CrmCopilotResult> {
  const text = message.trim()
  if (!text) return { success: false, error: 'Введите вопрос' }

  const result = await mostovoyFetch<{ reply?: string }>('/crm/developer/lab', {
    method: 'POST',
    body: {
      message: text,
      model: 'gpt-5.6-sol',
      prompts: {
        systemPrompt: `Ты — внутренний ИИ-помощник CRM магазина техники «Мостовой».
Помогай сотруднику ориентироваться в CRM кратко и практично. Если спрашивают, как добавить расход, направь в раздел «Финансы» и объясни: нажать «Добавить расход», заполнить название, сумму, категорию и дату, затем сохранить. Не выдумывай данные и не выполняй действия сам.`,
        characterPrompt: 'Отвечай по-русски, дружелюбно, без Markdown-таблиц.',
        rulesPrompt: 'Не сообщай секреты, персональные данные и внутренние ключи.',
        taskPrompt: 'Дай конкретный следующий шаг в интерфейсе CRM.',
      },
    },
  })

  if (!result.ok) return { success: false, error: result.error }
  const reply = String(result.data.reply || '').trim()
  if (!reply) return { success: false, error: 'ИИ вернул пустой ответ' }
  return { success: true, reply }
}

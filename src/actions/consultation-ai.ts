'use server'

import { createClient } from '@/lib/supabase/server'
import { getThread, updateConsultationMemory, type ActionResult } from './whatsapp'

export interface ConsultationAIResponse {
  reply: string
  memory: string
  signal: 'hot' | 'neutral' | 'unhappy'
}

const SYSTEM_PROMPT = `Ты — ассистент косметолога-консультанта во время живой консультации с клиентом.
Тебе даётся переписка консультанта с клиентом в WhatsApp и текущая память о клиенте.
Отвечай на вопрос консультанта кратко и по делу, опираясь только на переписку и память —
не выдумывай факты о клиенте, которых там нет.
Также обнови память о клиенте: включи туда все важные факты — жалобы, пожелания,
противопоказания, что уже обсуждали. Память должна быть полной (не только новое),
но краткой — это заметки, а не протокол.
Определи сигнал по последним сообщениям: "hot" — явно готов купить/записаться,
"unhappy" — недоволен/сомневается, иначе "neutral".
Ответь строго JSON: {"reply": "...", "memory": "...", "signal": "hot"|"neutral"|"unhappy"}`

export async function askConsultationAI(
  phone: string,
  consultationId: string | null,
  question: string
): Promise<ActionResult<ConsultationAIResponse>> {
  const threadRes = await getThread(phone)
  if (!threadRes.success) return threadRes
  const thread = threadRes.data ?? []

  let existingMemory = ''
  if (consultationId) {
    const supabase = await createClient()
    const { data } = await supabase
      .from('consultations')
      .select('ai_memory')
      .eq('id', consultationId)
      .maybeSingle()
    existingMemory = data?.ai_memory ?? ''
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return { success: false, error: 'ИИ не настроен (нет OPENAI_API_KEY)' }

  const transcript = thread
    .slice(-50)
    .map(m => `${m.direction === 'in' ? 'Клиент' : 'Консультант'}: ${m.text}`)
    .join('\n') || '(переписки пока нет)'

  const userContent = `Переписка с клиентом:\n${transcript}\n\nТекущая память о клиенте:\n${existingMemory || '(пусто)'}\n\nВопрос консультанта: ${question}`

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
      }),
    })

    if (!res.ok) {
      return { success: false, error: 'ИИ временно недоступен — не удалось связаться с провайдером ИИ.' }
    }

    const data = await res.json()
    const content = data.choices?.[0]?.message?.content
    const parsed = JSON.parse(content) as ConsultationAIResponse

    if (consultationId && parsed.memory) {
      await updateConsultationMemory(consultationId, parsed.memory)
    }

    return { success: true, data: parsed }
  } catch {
    return { success: false, error: 'ИИ временно недоступен — не удалось связаться с провайдером ИИ.' }
  }
}

'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { Consultation } from '@/types'
import { toLocal9, toWazzupChatId } from '@/lib/phone'

export type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; error: string }

const WAZZUP_API_URL = 'https://api.wazzup24.com/v3/message'

export interface WhatsappMessage {
  id: string
  phone: string
  direction: 'in' | 'out'
  text: string
  wazzup_message_id: string | null
  sent_by: string | null
  created_at: string
}

// ─── Текущий сотрудник ───────────────────────────────────────────────────────

interface Viewer { id: string; role: string }

async function getViewer(): Promise<Viewer | null> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null

  const { data } = await supabase
    .from('employees')
    .select('id, role')
    .eq('user_id', session.user.id)
    .is('deleted_at', null)
    .maybeSingle()

  return (data as Viewer | null) ?? null
}

// ─── Переписка ───────────────────────────────────────────────────────────────

export async function getThread(phone: string): Promise<ActionResult<WhatsappMessage[]>> {
  const me = await getViewer()
  if (!me) return { success: false, error: 'Не авторизован' }

  const local9 = toLocal9(phone)
  if (!local9) return { success: false, error: 'Некорректный номер' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('whatsapp_messages')
    .select('*')
    .like('phone', `%${local9}`)
    .order('created_at', { ascending: true })

  if (error) return { success: false, error: error.message }
  return { success: true, data: (data as WhatsappMessage[]) ?? [] }
}

export async function sendWhatsAppMessage(phone: string, text: string): Promise<ActionResult<WhatsappMessage>> {
  const me = await getViewer()
  if (!me) return { success: false, error: 'Не авторизован' }

  const apiKey = process.env.WAZZUP_API_KEY
  const channelId = process.env.WAZZUP_CHANNEL_ID
  if (!apiKey || !channelId) return { success: false, error: 'WhatsApp не настроен (нет WAZZUP_API_KEY/WAZZUP_CHANNEL_ID)' }

  const chatId = toWazzupChatId(phone)
  const trimmed = text.trim()
  if (!trimmed) return { success: false, error: 'Пустое сообщение' }

  const res = await fetch(WAZZUP_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ channelId, chatId, chatType: 'whatsapp', text: trimmed }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    return { success: false, error: `Wazzup: ${res.status} ${body.slice(0, 200)}` }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('whatsapp_messages')
    .insert({ phone: chatId, direction: 'out', text: trimmed, sent_by: me.id })
    .select('*')
    .single()

  if (error) return { success: false, error: error.message }
  revalidatePath('/dashboard/consultation-chat')
  return { success: true, data: data as WhatsappMessage }
}

// ─── Привязка к записи на консультацию ───────────────────────────────────────

export async function findConsultationsByPhone(phone: string): Promise<ActionResult<Consultation[]>> {
  const me = await getViewer()
  if (!me) return { success: false, error: 'Не авторизован' }

  const local9 = toLocal9(phone)
  if (!local9) return { success: true, data: [] }

  const supabase = await createClient()
  // Форматы записи номера бывают разные — берём недавние и фильтруем по цифрам.
  const { data, error } = await supabase
    .from('consultations')
    .select('*')
    .is('deleted_at', null)
    .not('phone', 'is', null)
    .order('date', { ascending: false })
    .limit(500)

  if (error) return { success: false, error: error.message }
  const matches = ((data as Consultation[]) ?? []).filter(c => c.phone && toLocal9(c.phone) === local9)
  return { success: true, data: matches }
}

export async function updateConsultationMemory(consultationId: string, memory: string): Promise<ActionResult> {
  const me = await getViewer()
  if (!me) return { success: false, error: 'Не авторизован' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('consultations')
    .update({ ai_memory: memory })
    .eq('id', consultationId)

  if (error) return { success: false, error: error.message }
  revalidatePath('/dashboard/consultation-chat')
  return { success: true }
}

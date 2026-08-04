'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Send, Sparkles, Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  getThread, sendWhatsAppMessage, findConsultationsByPhone, updateConsultationMemory,
  type WhatsappMessage,
} from '@/actions/whatsapp'
import { askConsultationAI, type ConsultationAIResponse } from '@/actions/consultation-ai'
import { applyPhoneMask, toWazzupChatId } from '@/lib/phone'
import type { Consultation } from '@/types'

const navy = 'var(--ink)'
const steel = 'var(--ink-25)'

const QUICK_QUESTIONS = [
  'Что ей посоветовать?',
  'Какие жалобы были раньше?',
  'Собери резюме консультации',
]

const SIGNAL_LABEL: Record<ConsultationAIResponse['signal'], { label: string; bg: string; color: string }> = {
  hot: { label: '🔥 Готов купить', bg: 'var(--orange-tint-2)', color: 'var(--orange-strong)' },
  unhappy: { label: '⚠️ Недоволен', bg: 'var(--bad-tint)', color: 'var(--brand-ink)' },
  neutral: { label: '', bg: '', color: '' },
}

type AiTurn = { role: 'user' | 'assistant'; text: string }

export default function ConsultationChatPage() {
  const supabase = useMemo(() => createClient(), [])

  const [phoneInput, setPhoneInput] = useState('')
  const [chatId, setChatId] = useState<string | null>(null)
  const [candidates, setCandidates] = useState<Consultation[]>([])
  const [consultation, setConsultation] = useState<Consultation | null>(null)

  const [thread, setThread] = useState<WhatsappMessage[]>([])
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  const [aiTurns, setAiTurns] = useState<AiTurn[]>([])
  const [aiQuestion, setAiQuestion] = useState('')
  const [aiThinking, setAiThinking] = useState(false)
  const [signal, setSignal] = useState<ConsultationAIResponse['signal'] | null>(null)

  const [memory, setMemory] = useState('')
  const [memoryDirty, setMemoryDirty] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [thread])

  useEffect(() => {
    if (!chatId) return
    const channel = supabase
      .channel(`wa-${chatId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'whatsapp_messages', filter: `phone=eq.${chatId}` },
        payload => setThread(prev => [...prev, payload.new as WhatsappMessage])
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [chatId, supabase])

  const startChat = useCallback(async () => {
    const id = toWazzupChatId(phoneInput)
    if (id.length !== 12) { toast.error('Введите номер полностью'); return }

    setChatId(id)
    setConsultation(null)
    setCandidates([])
    setMemory('')
    setAiTurns([])
    setSignal(null)

    const [threadRes, consultRes] = await Promise.all([
      getThread(phoneInput),
      findConsultationsByPhone(phoneInput),
    ])
    if (threadRes.success) setThread(threadRes.data ?? [])
    else toast.error(threadRes.error)

    if (consultRes.success) {
      const list = consultRes.data ?? []
      setCandidates(list)
      if (list.length === 1) {
        setConsultation(list[0])
        setMemory(list[0].ai_memory ?? '')
      }
    }
  }, [phoneInput])

  const pickConsultation = (c: Consultation) => {
    setConsultation(c)
    setMemory(c.ai_memory ?? '')
  }

  const handleSend = async () => {
    if (!chatId || !message.trim()) return
    setSending(true)
    const res = await sendWhatsAppMessage(chatId, message)
    if (!res.success) toast.error(res.error)
    else { setThread(prev => [...prev, res.data!]); setMessage('') }
    setSending(false)
  }

  const handleAskAI = async (question: string) => {
    const trimmed = question.trim()
    if (!chatId || !trimmed || aiThinking) return
    setAiTurns(prev => [...prev, { role: 'user', text: trimmed }])
    setAiQuestion('')
    setAiThinking(true)
    const res = await askConsultationAI(chatId, consultation?.id ?? null, trimmed)
    if (!res.success || !res.data) {
      setAiTurns(prev => [...prev, { role: 'assistant', text: res.success ? 'Не удалось получить ответ' : res.error }])
    } else {
      const { data } = res
      setAiTurns(prev => [...prev, { role: 'assistant', text: data.reply }])
      setMemory(data.memory)
      setMemoryDirty(false)
      setSignal(data.signal)
    }
    setAiThinking(false)
  }

  const handleSaveMemory = async () => {
    if (!consultation) return
    const res = await updateConsultationMemory(consultation.id, memory)
    if (!res.success) toast.error(res.error)
    else { toast.success('Память сохранена'); setMemoryDirty(false) }
  }

  const signalInfo = signal ? SIGNAL_LABEL[signal] : null

  return (
    <div className="p-4 md:p-8 flex flex-col gap-4" style={{ height: 'calc(100vh - 52px)' }}>
      <div className="flex gap-2 items-center flex-wrap shrink-0">
        <Input
          value={phoneInput}
          onChange={e => setPhoneInput(applyPhoneMask(e.target.value))}
          onKeyDown={e => { if (e.key === 'Enter') void startChat() }}
          placeholder="+996 (700) 123-456"
          className="max-w-[220px]"
        />
        <Button onClick={() => void startChat()}><Search size={15} className="mr-1.5" />Открыть чат</Button>

        {candidates.length > 1 && !consultation && (
          <div className="flex gap-1.5 flex-wrap">
            {candidates.map(c => (
              <button
                key={c.id}
                onClick={() => pickConsultation(c)}
                className="text-xs rounded-lg px-2.5 py-1"
                style={{ border: '1px solid var(--border)', color: navy }}
              >
                {c.client_name} · {c.date}
              </button>
            ))}
          </div>
        )}
        {consultation && (
          <span className="text-xs rounded-lg px-2.5 py-1" style={{ backgroundColor: 'var(--ok-tint-2)', color: 'var(--ok-strong-2)' }}>
            Привязано: {consultation.client_name} ({consultation.date})
          </span>
        )}
        {chatId && !consultation && candidates.length === 0 && (
          <span className="text-xs" style={{ color: steel }}>
            Запись на консультацию не найдена — память не будет сохраняться
          </span>
        )}
        {signalInfo?.label && (
          <span className="text-xs rounded-lg px-2.5 py-1 font-medium" style={{ backgroundColor: signalInfo.bg, color: signalInfo.color }}>
            {signalInfo.label}
          </span>
        )}
      </div>

      {!chatId ? (
        <div className="flex-1 flex items-center justify-center text-sm" style={{ color: steel }}>
          Введите номер телефона клиента, чтобы начать
        </div>
      ) : (
        <div className="flex-1 grid gap-4 min-h-0" style={{ gridTemplateColumns: '300px 1fr' }}>
          {/* Левая колонка */}
          <div className="flex flex-col gap-4 min-h-0">
            {/* ИИ-ассистент */}
            <div className="rounded-2xl bg-white flex flex-col flex-1 min-h-0" style={{ border: '1px solid var(--border)' }}>
              <div className="px-4 py-3 flex items-center gap-2 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
                <Sparkles size={15} color="var(--brand)" />
                <span className="text-sm font-bold" style={{ color: navy }}>ИИ-ассистент</span>
              </div>
              <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
                {aiTurns.length === 0 && (
                  <div className="flex flex-col gap-1.5">
                    {QUICK_QUESTIONS.map(q => (
                      <button
                        key={q}
                        onClick={() => void handleAskAI(q)}
                        className="text-xs text-left rounded-lg px-2.5 py-2"
                        style={{ backgroundColor: 'var(--paper-2)', color: steel }}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}
                {aiTurns.map((t, i) => (
                  <div
                    key={i}
                    className={`text-xs rounded-lg px-2.5 py-2 max-w-[90%] ${t.role === 'user' ? 'self-end' : 'self-start'}`}
                    style={t.role === 'user' ? { backgroundColor: 'var(--paper-2)', color: navy } : { backgroundColor: 'var(--brand)', color: 'var(--on-brand)' }}
                  >
                    {t.text}
                  </div>
                ))}
                {aiThinking && <span className="text-xs" style={{ color: steel }}>Думаю…</span>}
              </div>
              <div className="p-2.5 flex gap-1.5 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
                <input
                  value={aiQuestion}
                  onChange={e => setAiQuestion(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') void handleAskAI(aiQuestion) }}
                  placeholder="Спросите про клиента…"
                  className="flex-1 rounded-lg px-2.5 py-1.5 text-xs outline-none"
                  style={{ border: '1px solid var(--border)' }}
                />
                <button
                  onClick={() => void handleAskAI(aiQuestion)}
                  disabled={aiThinking}
                  className="rounded-lg p-1.5 text-white disabled:opacity-50"
                  style={{ backgroundColor: 'var(--brand)' }}
                >
                  <Send size={13} />
                </button>
              </div>
            </div>

            {/* Память о клиенте */}
            <div className="rounded-2xl bg-white p-3 flex flex-col gap-2 shrink-0" style={{ border: '1px solid var(--border)', height: 220 }}>
              <span className="text-sm font-bold" style={{ color: navy }}>Память о клиенте</span>
              <textarea
                value={memory}
                onChange={e => { setMemory(e.target.value); setMemoryDirty(true) }}
                placeholder="Пока ничего не записано…"
                className="flex-1 resize-none rounded-lg p-2 text-xs outline-none"
                style={{ border: '1px solid var(--border)' }}
              />
              {consultation && (
                <Button size="sm" variant="outline" onClick={() => void handleSaveMemory()} disabled={!memoryDirty}>
                  Сохранить
                </Button>
              )}
            </div>
          </div>

          {/* Переписка WhatsApp */}
          <div className="rounded-2xl bg-white flex flex-col min-h-0" style={{ border: '1px solid var(--border)' }}>
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 flex flex-col gap-2.5">
              {thread.length === 0 && (
                <p className="text-sm text-center py-10" style={{ color: steel }}>Сообщений пока нет</p>
              )}
              {thread.map(m => (
                <div
                  key={m.id}
                  className={`max-w-[70%] px-3.5 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${m.direction === 'out' ? 'self-end' : 'self-start'}`}
                  style={m.direction === 'out'
                    // Зелёный пузыря WhatsApp — цвет самого мессенджера: переписка
                    // должна выглядеть как в нём. При перекраске CRM не меняется.
                    ? { backgroundColor: '#dcf8c6', color: navy }
                    : { backgroundColor: 'var(--paper-2)', color: navy, border: '1px solid var(--border)' }}
                >
                  {m.text}
                </div>
              ))}
            </div>
            <div className="p-3 flex gap-2 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
              <textarea
                rows={1}
                value={message}
                onChange={e => setMessage(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend() } }}
                placeholder="Написать в WhatsApp…"
                className="flex-1 resize-none rounded-xl px-3.5 py-2.5 text-sm outline-none"
                style={{ border: '1px solid var(--border)' }}
              />
              <Button onClick={() => void handleSend()} disabled={sending || !message.trim()}>
                <Send size={15} />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

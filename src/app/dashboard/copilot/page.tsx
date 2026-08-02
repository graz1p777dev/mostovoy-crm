'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Sparkles, Send, Check, Pencil, X } from 'lucide-react'
import { botJson } from '@/lib/bot-api'
import { askCrmCopilot } from '@/actions/crm-copilot'

type ChatButton = { label: string; href: string }
type ChatMessage = {
  id: number | string
  role: 'user' | 'assistant'
  content: string
  buttons: ChatButton[]
  created_at: string | null
}
type PendingAction = { id: number; tool_name: string; payload: Record<string, unknown> }

const EXAMPLES = [
  'Как добавить расход?',
  'Покажи продажи за неделю.',
  'Какие товары заканчиваются?',
  'Где посмотреть сотрудников?',
  'Что означает эта ошибка?',
]

const ACTION_TITLES: Record<string, string> = {
  propose_create_expense: 'Создать расход?',
  propose_create_consultation: 'Забронировать консультацию?',
}

const ACTION_FIELD_LABELS: Record<string, string> = {
  title: 'Название', amount: 'Сумма', category: 'Категория', expense_date: 'Дата',
  currency: 'Валюта', date: 'Дата', time: 'Время',
}

// Реальные токены приложения: var(--surface-2)/var(--text-strong)/var(--border-soft)
// нигде не определены в globals.css этого репо (в отличие от старого фронтенда,
// откуда была скопирована эта страница) — раньше это давало невидимый фон и рамку.
const ink = '#1b1517'
const steel = '#6b6063'
const muted = '#7d7174'
const areaStyle = { backgroundColor: '#fdfbfb', color: ink, border: '1px solid var(--border)' } as const

function ActionCard({ action, onDone }: { action: PendingAction; onDone: (msg: ChatMessage) => void }) {
  const [editing, setEditing] = useState(false)
  const [fields, setFields] = useState<Record<string, unknown>>(action.payload)
  const [busy, setBusy] = useState(false)

  const confirm = async () => {
    setBusy(true)
    try {
      const res = await botJson<{ ok: boolean; message: ChatMessage }>(
        `/copilot/actions/${action.id}/confirm`, 'POST', editing ? { edits: fields } : {}
      )
      onDone(res.message)
    } catch {
      onDone({ id: `err-${action.id}`, role: 'assistant', buttons: [], created_at: null,
        content: 'Не удалось выполнить действие. Попробуйте ещё раз.' })
    } finally {
      setBusy(false)
    }
  }

  const cancel = async () => {
    setBusy(true)
    try { await botJson(`/copilot/actions/${action.id}/cancel`, 'POST') } catch { /* noop */ }
    onDone({ id: `cancel-${action.id}`, role: 'assistant', buttons: [], created_at: null, content: 'Действие отменено.' })
  }

  return (
    <div className="rounded-2xl px-4 py-3.5 max-w-xs self-start" style={{ backgroundColor: '#fff', border: '1px solid #e11d1d' }}>
      <div className="text-xs font-bold mb-2" style={{ color: ink }}>
        {ACTION_TITLES[action.tool_name] || 'Подтвердите действие'}
      </div>
      {Object.entries(fields).filter(([k]) => k !== 'currency' || fields.currency).map(([key, value]) => (
        <div key={key} className="flex items-center justify-between gap-2 py-0.5 text-xs" style={{ color: steel }}>
          <span>{ACTION_FIELD_LABELS[key] || key}</span>
          {editing ? (
            <input
              value={String(value ?? '')}
              onChange={e => setFields(f => ({ ...f, [key]: e.target.value }))}
              className="rounded px-1.5 py-0.5 text-xs text-right outline-none"
              style={{ ...areaStyle, width: 130 }}
            />
          ) : (
            <b style={{ color: ink }}>
              {String(value)}{key === 'amount' && fields.currency ? ` ${fields.currency}` : ''}
            </b>
          )}
        </div>
      ))}
      <div className="flex gap-1.5 mt-2.5">
        <button onClick={confirm} disabled={busy} className="flex-1 flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: '#e11d1d' }}>
          <Check size={12} /> {editing ? 'Сохранить и подтвердить' : 'Подтвердить'}
        </button>
        {!editing && (
          <button onClick={() => setEditing(true)} disabled={busy} className="rounded-lg px-2 py-1.5" style={areaStyle}>
            <Pencil size={12} />
          </button>
        )}
        <button onClick={cancel} disabled={busy} className="rounded-lg px-2 py-1.5" style={{ backgroundColor: '#fee2e2', color: '#c01818' }}>
          <X size={12} />
        </button>
      </div>
    </div>
  )
}

export default function HelpPage() {
  return (
    <Suspense fallback={null}>
      <HelpPageInner />
    </Suspense>
  )
}

function HelpPageInner() {
  const searchParams = useSearchParams()
  const [conversationId, setConversationId] = useState<number | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pageContextRef = useRef<{ path: string } | null>(null)
  const autoSentRef = useRef(false)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, pendingAction])

  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`
  }, [input])

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setInput('')
    setSending(true)
    const optimisticUser: ChatMessage = { id: `local-${Date.now()}`, role: 'user', content: trimmed, buttons: [], created_at: null }
    setMessages(prev => [...prev, optimisticUser])

    try {
      const res = await askCrmCopilot(trimmed)
      if (!res.success) throw new Error(res.error)
      setMessages(prev => [...prev, {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        buttons: [],
        created_at: new Date().toISOString(),
        content: res.reply,
      }])
      setPendingAction(null)
    } catch {
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`, role: 'assistant', buttons: [], created_at: null,
        content: 'Не удалось получить ответ. Попробуйте ещё раз.',
      }])
    } finally {
      setSending(false)
    }
  }, [conversationId, sending])

  // Auto-send the query passed in from the topbar's "ask AI" input. Deferred
  // via setTimeout so the initial setState doesn't run synchronously inside
  // the effect body.
  useEffect(() => {
    if (autoSentRef.current) return
    const q = searchParams.get('q')
    const contextPath = searchParams.get('context_path')
    if (contextPath) pageContextRef.current = { path: contextPath }
    if (q) {
      // Flag flips only once the timer actually fires — React's dev-mode
      // double effect invocation (mount → cleanup → mount) would otherwise
      // clear the first timer and, seeing the flag already set, skip
      // scheduling a second one, so the message would never send.
      const timer = setTimeout(() => {
        autoSentRef.current = true
        send(q)
      }, 0)
      return () => clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  return (
    <div className="p-4 md:p-8 flex flex-col gap-4 max-w-3xl mx-auto" style={{ height: 'calc(100vh - 52px)' }}>
      {messages.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center">
          <Sparkles size={36} color="#e11d1d" />
          <h2 className="text-xl font-bold" style={{ color: ink }}>Чем я могу помочь?</h2>
          <div className="flex flex-col gap-2 w-full max-w-md">
            {EXAMPLES.map(ex => (
              <button key={ex} onClick={() => send(ex)}
                className="rounded-xl px-3.5 py-2.5 text-sm text-left transition-colors"
                style={{ backgroundColor: '#fff', border: '1px solid var(--border)', color: steel }}>
                {ex}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div ref={scrollRef} className="flex-1 overflow-y-auto flex flex-col gap-3 py-2">
          {messages.map(m => (
            <div key={m.id} className={`flex flex-col gap-1 max-w-[85%] ${m.role === 'user' ? 'self-end items-end' : 'self-start items-start'}`}>
              <span className="text-[10px]" style={{ color: muted }}>
                {m.role === 'assistant' ? 'ИИ-помощник' : 'Вы'}
              </span>
              <div className="px-3.5 py-2 text-sm rounded-2xl [&_p]:m-0 [&_p+p]:mt-2 [&_ul]:my-1 [&_ul]:pl-4 [&_ol]:my-1 [&_ol]:pl-4 [&_strong]:font-semibold"
                style={m.role === 'user'
                  ? { backgroundColor: '#fdfbfb', border: '1px solid var(--border)', color: ink, borderBottomRightRadius: 4 }
                  : { backgroundColor: '#e11d1d', color: '#fff', borderBottomLeftRadius: 4 }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
              </div>
              {m.buttons.length > 0 && (
                <div className="flex gap-1.5 flex-wrap justify-start">
                  {m.buttons.map(b => (
                    <a key={b.href} href={b.href} className="text-xs rounded-lg px-2.5 py-1 no-underline"
                      style={{ backgroundColor: '#fdfbfb', color: ink }}>
                      {b.label}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
          {sending && (
            <div className="self-start px-3.5 py-2.5 rounded-2xl" style={{ backgroundColor: '#e11d1d' }}>
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <span key={i} className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: '#fff', animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          )}
          {pendingAction && (
            <ActionCard action={pendingAction} onDone={(msg) => { setPendingAction(null); setMessages(prev => [...prev, msg]) }} />
          )}
        </div>
      )}

      <div className="flex gap-2 items-end shrink-0">
        <textarea
          ref={textareaRef}
          rows={1}
          placeholder="Спросите про CRM или данные компании…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 resize-none rounded-xl px-3.5 py-2.5 text-sm outline-none"
          style={{ ...areaStyle, maxHeight: 160 }}
        />
        <button onClick={() => send(input)} disabled={sending || !input.trim()}
          className="rounded-xl p-2.5 text-white disabled:opacity-50" style={{ backgroundColor: '#e11d1d' }}>
          <Send size={16} />
        </button>
      </div>
    </div>
  )
}

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { UserPlus, Send, Trash2, Beaker, RefreshCw } from 'lucide-react'
import { botDelete, botGet, botJson } from '@/lib/bot-api'
import type { BotChatMessage, BotTestUser } from '@/types'

// Тестовый клиент пишет живому прод-боту: тот же буфер, та же модель, та же
// карточка менеджеру в Telegram. Разница одна — в amoCRM не уходит ничего,
// и карточка помечена «🧪 ТЕСТОВЫЙ ПОЛЬЗОВАТЕЛЬ».
const CHAT_POLL_MS = 3000

const btn = 'rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50'
const input = 'w-full rounded-xl px-3 py-2 text-sm outline-none'
const inputStyle = { backgroundColor: '#fdfbfb', color: '#1b1517' } as const
const muted = { color: '#6b6063' }

function roleLabel(role: string): string {
  if (role === 'user') return 'Клиент'
  if (role === 'assistant') return 'Бот'
  return 'Менеджер'
}

export default function TestUsers() {
  const [users, setUsers] = useState<BotTestUser[]>([])
  const [selected, setSelected] = useState<BotTestUser | null>(null)
  const [messages, setMessages] = useState<BotChatMessage[]>([])
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const chatRef = useRef<HTMLDivElement>(null)

  const loadUsers = useCallback(async () => {
    try {
      setUsers(await botGet<BotTestUser[]>('/admin/lab/test-users'))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить тестовых пользователей')
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    botGet<BotTestUser[]>('/admin/lab/test-users')
      .then((list) => {
        if (!cancelled) setUsers(list)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Не удалось загрузить тестовых пользователей')
      })
    return () => {
      cancelled = true
    }
  }, [])

  // История чата тянется по amocrm_lead_id — тем же роутом, что и у живых лидов,
  // поэтому ссылка «Открыть в CRM» из карточки Telegram тоже работает.
  useEffect(() => {
    if (!selected) return
    let cancelled = false

    async function tick() {
      try {
        const data = await botGet<{ messages: BotChatMessage[] }>(`/admin/chat/${selected!.amocrm_lead_id}`)
        if (!cancelled) setMessages(data.messages ?? [])
      } catch {
        /* сеть моргнула — покажем на следующем тике */
      }
    }

    tick()
    const id = setInterval(tick, CHAT_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [selected])

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
  }, [messages])

  async function createUser() {
    if (!name.trim() || busy) return
    setBusy(true)
    try {
      const user = await botJson<BotTestUser>('/admin/lab/test-users', 'POST', {
        name: name.trim(),
        contact: contact.trim() || null,
      })
      setName('')
      setContact('')
      setUsers((prev) => [user, ...prev])
      setSelected(user)
      setMessages([])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось создать тестового пользователя')
    } finally {
      setBusy(false)
    }
  }

  async function sendMessage() {
    if (!selected || !draft.trim() || busy) return
    setBusy(true)
    try {
      const res = await botJson<{ delay_seconds: number }>(
        `/admin/lab/test-users/${selected.id}/messages`,
        'POST',
        { text: draft.trim() }
      )
      setDraft('')
      setError(null)
      // Бот копит сообщения в буфере, прежде чем позвать модель — иначе он
      // отвечал бы на каждую строчку отдельно. Пользователь не должен думать,
      // что ничего не произошло.
      setNotice(`Бот думает — ответ появится примерно через ${res.delay_seconds} с`)
      setTimeout(() => setNotice(null), (res.delay_seconds + 20) * 1000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось отправить сообщение')
    } finally {
      setBusy(false)
    }
  }

  async function removeUser(user: BotTestUser) {
    if (busy) return
    setBusy(true)
    try {
      await botDelete(`/admin/lab/test-users/${user.id}`)
      setUsers((prev) => prev.filter((u) => u.id !== user.id))
      if (selected?.id === user.id) {
        setSelected(null)
        setMessages([])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить тестового пользователя')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-2xl overflow-hidden bg-white">
      <div className="flex items-center justify-between gap-2.5 px-5 py-4" style={{ borderBottom: '1px solid #ebebee' }}>
        <div className="flex items-center gap-2.5">
          <div className="rounded-lg p-1.5" style={{ backgroundColor: '#e11d1d' }}>
            <Beaker size={15} color="#fff" />
          </div>
          <span className="text-sm font-medium" style={{ color: '#1b1517' }}>
            Тестовые пользователи
          </span>
        </div>
        <button onClick={loadUsers} className="rounded-lg p-1.5" style={{ backgroundColor: '#fdfbfb' }} title="Обновить">
          <RefreshCw size={14} color="#1b1517" />
        </button>
      </div>

      <div className="px-5 py-4 text-xs" style={{ backgroundColor: '#fff7ed', color: '#92400e' }}>
        Тестовый клиент пишет настоящему боту: тот же ИИ, та же карточка менеджеру в Telegram
        с пометкой «🧪 ТЕСТОВЫЙ ПОЛЬЗОВАТЕЛЬ». В amoCRM ничего не попадает, лида там нет.
      </div>

      <div className="grid" style={{ gridTemplateColumns: '300px 1fr' }}>
        {/* Список и создание */}
        <div className="p-4 flex flex-col gap-3" style={{ borderRight: '1px solid #ebebee' }}>
          <div className="flex flex-col gap-2">
            <input
              className={input}
              style={inputStyle}
              placeholder="Имя клиента"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className={input}
              style={inputStyle}
              placeholder="Телефон (необязательно)"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
            />
            <button
              onClick={createUser}
              disabled={!name.trim() || busy}
              className={`${btn} flex items-center justify-center gap-2 text-white`}
              style={{ backgroundColor: '#e11d1d' }}
            >
              <UserPlus size={14} /> Создать
            </button>
          </div>

          <div className="flex flex-col gap-1.5 mt-1">
            {users.length === 0 && <p className="text-xs" style={muted}>Пока никого нет</p>}
            {users.map((u) => (
              <div
                key={u.id}
                className="rounded-xl px-3 py-2 flex items-start justify-between gap-2 cursor-pointer"
                style={{ backgroundColor: selected?.id === u.id ? '#fdfbfb' : '#fdfbfb' }}
                onClick={() => {
                  setSelected(u)
                  setMessages([])
                }}
              >
                <div className="min-w-0">
                  <p className="text-sm truncate" style={{ color: '#1b1517' }}>{u.name}</p>
                  <p className="text-[11px] truncate" style={muted}>
                    {u.pending_approvals > 0 ? `${u.pending_approvals} на согласовании` : (u.last_message ?? 'нет сообщений')}
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    removeUser(u)
                  }}
                  title="Удалить вместе с перепиской"
                  className="shrink-0 p-1 rounded-lg"
                >
                  <Trash2 size={13} color="#7d7174" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Чат */}
        <div className="p-4 flex flex-col gap-3">
          {!selected && (
            <p className="text-sm text-center mt-20" style={muted}>
              Выберите тестового пользователя или создайте нового
            </p>
          )}

          {selected && (
            <>
              <div
                ref={chatRef}
                className="rounded-xl p-3 flex flex-col gap-2 overflow-y-auto"
                style={{ backgroundColor: '#fdfbfb', minHeight: 280, maxHeight: 420 }}
              >
                {messages.length === 0 && (
                  <p className="text-sm text-center mt-16" style={muted}>
                    Напишите от лица клиента — бот ответит и пришлёт карточку менеджеру
                  </p>
                )}
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className="rounded-xl px-3 py-2 max-w-[80%]"
                    style={{
                      alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                      backgroundColor: m.role === 'user' ? '#e11d1d' : '#fff',
                      color: m.role === 'user' ? '#fff' : '#1b1517',
                    }}
                  >
                    <p className="text-[10px] mb-0.5 opacity-70">{roleLabel(m.role)}</p>
                    <p className="text-sm whitespace-pre-wrap">{m.text}</p>
                  </div>
                ))}
              </div>

              {notice && <p className="text-xs" style={{ color: '#047857' }}>{notice}</p>}
              {error && <p className="text-xs" style={{ color: '#c01818' }}>{error}</p>}

              <div className="flex gap-2">
                <input
                  className={input}
                  style={inputStyle}
                  placeholder="Сообщение от лица клиента…"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      sendMessage()
                    }
                  }}
                />
                <button
                  onClick={sendMessage}
                  disabled={!draft.trim() || busy}
                  className={`${btn} flex items-center gap-2 text-white shrink-0`}
                  style={{ backgroundColor: '#e11d1d' }}
                >
                  <Send size={14} /> Отправить
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

'use client'

// Единый inbox витрины «МОСТОВОЙ»: слева список диалогов, посередине
// переписка, справа карточка клиента. Своей копии сообщений у CRM нет —
// всё читается и пишется через админ-API магазина серверными действиями,
// поэтому x-admin-token не покидает сервер.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Bot, Headset, MessageSquare, Search, Send, User } from 'lucide-react'
import {
  getShopConversation,
  getShopInbox,
  sendShopMessage,
  updateShopConversation,
  type ShopInboxData,
} from '@/actions/mostovoy-crm'
import { getDealLinksByExternalKeys, type DealLink } from '@/actions/deals'
import type { ShopInboxConversation, ShopInboxDetail } from '@/lib/models/mostovoy'

/**
 * Список витрины — это один SELECT по SQLite без внешних вызовов, так что
 * опрос дешёвый. 15 секунд: новое сообщение появляется само, но при открытой
 * вкладке это всего четыре запроса в минуту.
 */
const POLL_MS = 15_000

const SOURCE_LABELS: Record<string, string> = {
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  amocrm: 'amoCRM',
}

// Плашки источников — светлые и насыщенные, как в админке витрины.
const SOURCE_BADGE: Record<string, { bg: string; color: string }> = {
  telegram: { bg: 'var(--info-soft)', color: 'var(--info)' },
  whatsapp: { bg: 'var(--ok-soft-2)', color: 'var(--ok-ink-2)' },
  amocrm: { bg: 'var(--ok-soft-2)', color: 'var(--ok-ink-2)' },
  instagram: { bg: 'var(--brand-soft)', color: 'var(--brand-ink)' },
}

function sourceLabel(source: string) {
  return SOURCE_LABELS[source] ?? source
}

function initial(name: string) {
  return name.trim().charAt(0).toLocaleUpperCase('ru') || '?'
}

/** Дата в списке и под пузырём: чем свежее, тем подробнее. */
function fmtRelative(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  const diffMin = Math.round((Date.now() - date.getTime()) / 60_000)
  if (diffMin < 1) return 'только что'
  if (diffMin < 60) return `${diffMin} мин`
  const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  const today = new Date()
  const sameDay = date.toDateString() === today.toDateString()
  if (sameDay) return time
  const yesterday = new Date(today.getTime() - 86_400_000)
  if (date.toDateString() === yesterday.toDateString()) return `вчера ${time}`
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
}

function fmtUsd(value: number) {
  return `$${value.toFixed(value >= 1 ? 2 : 4)}`
}

function fmtAmount(amount: number | null, currency: string) {
  if (amount === null) return 'без суммы'
  return `${amount.toLocaleString('ru-RU')} ${currency}`
}

interface Props {
  initialData: ShopInboxData
  initialDealLinks: Record<string, DealLink>
}

export function ShopInboxClient({ initialData, initialDealLinks }: Props) {
  const [data, setData] = useState(initialData)
  const [dealLinks, setDealLinks] = useState(initialDealLinks)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<ShopInboxDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState('')
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [aiPending, setAiPending] = useState(false)
  const [notePending, setNotePending] = useState(false)
  // На узком экране список и чат делят одну колонку.
  const [view, setView] = useState<'list' | 'chat'>('list')

  const streamRef = useRef<HTMLDivElement>(null)
  // Пока летит запрос за перепиской, пользователь может кликнуть другой диалог —
  // ответ на устаревший клик нельзя показывать.
  const openedRef = useRef<number | null>(null)

  const conversations = data.conversations

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('ru')
    if (!needle) return conversations
    return conversations.filter((c) =>
      [c.customerName, c.customerUsername, c.customerPhone, c.lastMessage]
        .filter(Boolean)
        .some((field) => String(field).toLocaleLowerCase('ru').includes(needle))
    )
  }, [conversations, query])

  const selected = detail?.conversation ?? null
  const deal = selected ? dealLinks[selected.externalKey] : undefined

  const openConversation = useCallback(async (id: number) => {
    openedRef.current = id
    setSelectedId(id)
    setView('chat')
    setDetail(null)
    setDetailLoading(true)
    const result = await getShopConversation(id)
    if (openedRef.current !== id) return
    if (result.ok) {
      setDetail(result.data)
      setNote(result.data.conversation.notes)
      // Витрина обнулила unread_count этим же запросом — счётчик в списке
      // должен погаснуть сразу, а не через опрос.
      setData((prev) => ({
        ...prev,
        conversations: prev.conversations.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c)),
      }))
    } else {
      toast.error(result.error)
    }
    setDetailLoading(false)
  }, [])

  // Опрос: список — всегда, открытая переписка — если она есть. Интервал
  // пересоздаётся при смене диалога, поэтому внутри всегда актуальный id.
  useEffect(() => {
    const timer = setInterval(() => {
      void (async () => {
        const list = await getShopInbox()
        if (list.ok) setData(list.data)
        if (selectedId === null) return
        const fresh = await getShopConversation(selectedId)
        if (fresh.ok && openedRef.current === selectedId) setDetail(fresh.data)
      })()
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [selectedId])

  // Сделки заводятся из этих же диалогов, поэтому связку обновляем только
  // когда меняется состав диалогов, а не на каждый опрос.
  const keysSignature = conversations.map((c) => c.externalKey).sort().join('|')
  useEffect(() => {
    let alive = true
    const keys = keysSignature ? keysSignature.split('|') : []
    void getDealLinksByExternalKeys(keys).then((map) => {
      if (alive) setDealLinks(map)
    })
    return () => {
      alive = false
    }
  }, [keysSignature])

  // Лента всегда стоит на последнем сообщении.
  useEffect(() => {
    const el = streamRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [detail])

  function patchConversation(updated: ShopInboxConversation) {
    setData((prev) => ({
      ...prev,
      conversations: prev.conversations.map((c) => (c.id === updated.id ? updated : c)),
    }))
  }

  async function toggleAi(next: boolean) {
    if (!selected || aiPending) return
    setAiPending(true)
    const result = await updateShopConversation(selected.id, { aiEnabled: next })
    if (result.ok) {
      setDetail(result.data)
      patchConversation(result.data.conversation)
      toast.success(next ? 'AI снова отвечает клиенту' : 'AI выключен — отвечает менеджер')
    } else {
      toast.error(result.error)
    }
    setAiPending(false)
  }

  async function saveNote() {
    if (!selected || notePending) return
    setNotePending(true)
    const result = await updateShopConversation(selected.id, { notes: note })
    if (result.ok) {
      setDetail(result.data)
      patchConversation(result.data.conversation)
      toast.success('Заметка сохранена')
    } else {
      toast.error(result.error)
    }
    setNotePending(false)
  }

  async function send() {
    const text = draft.trim()
    if (!selected || !text || sending) return
    setSending(true)
    const result = await sendShopMessage(selected.id, text)
    if (result.ok) {
      setDetail(result.data)
      patchConversation(result.data.conversation)
      setDraft('')
    } else {
      // Витрина отвечает своим текстом: «Telegram bot не настроен», «Telegram: HTTP 400»…
      toast.error(result.error)
    }
    setSending(false)
  }

  const overview = data.usage.overview
  const tiles: [string, string][] = [
    ['Диалогов', overview.conversations.toLocaleString('ru-RU')],
    ['Сообщений', overview.messages.toLocaleString('ru-RU')],
    ['AI ответов', overview.aiReplies.toLocaleString('ru-RU')],
    ['Принято', overview.approved.toLocaleString('ru-RU')],
    ['Без правок', overview.withoutEdits.toLocaleString('ru-RU')],
    ['Отклонено', overview.rejected.toLocaleString('ru-RU')],
    ['Расход AI', fmtUsd(data.usage.periods.all.costUsd)],
  ]

  return (
    <div className="flex flex-col gap-4 p-4 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="kicker">Единый inbox</p>
          <h1 className="block-title span-rule mt-2">Диалоги</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <ChannelPill label="Telegram" on={data.status.telegram} />
          <ChannelPill label="WhatsApp · amoCRM" on={data.status.amocrm} />
          <ChannelPill label="AI" on={data.status.ai} />
        </div>
      </header>

      <div
        className="grid gap-2.5"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(118px, 1fr))' }}
      >
        {tiles.map(([label, value]) => (
          <article
            key={label}
            className="card-hover rounded-2xl px-4 py-3.5"
            style={{ border: '1px solid var(--line)', background: 'var(--surface)' }}
          >
            <strong className="tnum block text-xl leading-none" style={{ color: 'var(--brand)' }}>
              {value}
            </strong>
            <span className="mt-2 block text-[11px]" style={{ color: 'var(--ink-3)' }}>
              {label}
            </span>
          </article>
        ))}
      </div>

      <div className="inbox" data-view={view}>
        {/* ── Колонка 1: список диалогов ─────────────────────────────── */}
        <aside className="inbox__list">
          <div className="flex items-center justify-between px-5 pb-3.5 pt-5">
            <b className="text-[15px]" style={{ color: 'var(--ink)' }}>Все диалоги</b>
            <span
              className="tnum grid h-[26px] min-w-[26px] place-items-center rounded-full px-1.5 text-[11px] font-extrabold text-white"
              style={{ background: 'var(--accent-from)' }}
            >
              {conversations.length}
            </span>
          </div>

          <label className="inbox__search">
            <Search size={15} aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Имя или сообщение"
              aria-label="Поиск по диалогам"
            />
          </label>

          <div className="inbox__threads">
            {visible.length === 0 ? (
              <div className="inbox__empty">
                <MessageSquare size={22} style={{ color: 'var(--ink-4)' }} aria-hidden />
                {conversations.length === 0 ? (
                  <>
                    <b style={{ color: 'var(--ink)' }}>Диалогов пока нет</b>
                    <span>Напишите боту магазина — переписка появится здесь автоматически.</span>
                  </>
                ) : (
                  <span>Ничего не найдено — измените запрос.</span>
                )}
              </div>
            ) : (
              visible.map((c) => {
                const badge = SOURCE_BADGE[c.source]
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => void openConversation(c.id)}
                    className={`inbox__thread${selectedId === c.id ? ' inbox__thread--active' : ''}`}
                  >
                    <span className="inbox__avatar" aria-hidden>{initial(c.customerName)}</span>
                    <span className="min-w-0 self-center">
                      <span className="flex min-w-0 items-center justify-between gap-2">
                        <b className="truncate text-[12.5px]">{c.customerName}</b>
                        <time className="shrink-0 text-[9px]" style={{ color: 'var(--ink-4)' }}>
                          {fmtRelative(c.lastMessageAt)}
                        </time>
                      </span>
                      {/* Счётчик непрочитанных лежит поверх строки — освобождаем ему место. */}
                      <span
                        className="mt-1.5 flex min-w-0 items-center gap-1.5"
                        style={{ paddingRight: c.unreadCount > 0 ? 22 : 0 }}
                      >
                        <em
                          className="shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-extrabold uppercase not-italic leading-none"
                          style={
                            badge
                              ? { background: badge.bg, color: badge.color }
                              : { background: 'var(--surface-2)', color: 'var(--ink-3)' }
                          }
                        >
                          {sourceLabel(c.source)}
                        </em>
                        <small className="truncate text-[10px]" style={{ color: 'var(--ink-3)' }}>
                          {c.lastMessage || 'Новый диалог'}
                        </small>
                      </span>
                    </span>
                    {c.unreadCount > 0 && <strong className="inbox__unread">{c.unreadCount}</strong>}
                  </button>
                )
              })
            )}
          </div>
        </aside>

        {/* ── Колонка 2: переписка ───────────────────────────────────── */}
        <section className="inbox__chat">
          {!selected ? (
            <div className="inbox__empty">
              <span className="brand-mark block h-14 w-14" aria-hidden />
              <b className="text-base" style={{ color: 'var(--ink)' }}>
                {detailLoading ? 'Открываем диалог…' : 'Выберите диалог'}
              </b>
              <span>Здесь появится переписка клиента с ботом или менеджером.</span>
            </div>
          ) : (
            <>
              <header
                className="flex min-h-[74px] items-center gap-3 px-5 py-3"
                style={{ borderBottom: '1px solid var(--line)' }}
              >
                <button
                  type="button"
                  onClick={() => setView('list')}
                  className="text-sm font-semibold max-[760px]:block hidden"
                  style={{ color: 'var(--brand-ink)' }}
                >
                  ←
                </button>
                <span className="inbox__avatar inbox__avatar--lg" aria-hidden>
                  {initial(selected.customerName)}
                </span>
                <div className="min-w-0">
                  <b className="block truncate text-sm" style={{ color: 'var(--ink)' }}>
                    {selected.customerName}
                  </b>
                  <small className="mt-0.5 block text-[10.5px]" style={{ color: 'var(--ink-3)' }}>
                    {sourceLabel(selected.source)} · {selected.aiEnabled ? 'AI отвечает' : 'ручной режим'}
                  </small>
                </div>
                <label className="inbox__switch" title="Автоответы AI в этом диалоге">
                  <input
                    type="checkbox"
                    checked={selected.aiEnabled}
                    disabled={aiPending}
                    onChange={(e) => void toggleAi(e.target.checked)}
                  />
                  <i aria-hidden />
                  <b className="text-[10px] font-extrabold tracking-wide" style={{ color: 'var(--ink-3)' }}>
                    AI
                  </b>
                </label>
              </header>

              <div className="inbox__stream" ref={streamRef}>
                {detail && detail.messages.length === 0 ? (
                  <div className="inbox__empty">
                    <span>Сообщений пока нет.</span>
                  </div>
                ) : (
                  detail?.messages.map((m) => {
                    const outgoing = m.direction === 'outgoing'
                    const Icon = m.sender === 'assistant' ? Bot : m.sender === 'manager' ? Headset : User
                    const who =
                      m.sender === 'assistant' ? 'AI' : m.sender === 'manager' ? 'Менеджер' : selected.customerName
                    return (
                      <article
                        key={m.id}
                        className={`inbox__bubble${outgoing ? ' inbox__bubble--out' : ''}`}
                      >
                        <p>{m.text}</p>
                        <footer className="flex items-center justify-end gap-1">
                          <Icon size={9} aria-hidden />
                          {who} · {fmtRelative(m.createdAt)}
                        </footer>
                      </article>
                    )
                  })
                )}
              </div>

              <form
                className="inbox__composer"
                onSubmit={(e) => {
                  e.preventDefault()
                  void send()
                }}
              >
                <textarea
                  rows={1}
                  maxLength={4000}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault()
                      void send()
                    }
                  }}
                  placeholder="Написать клиенту… (Ctrl+Enter — отправить)"
                />
                <button
                  type="submit"
                  disabled={sending || !draft.trim()}
                  className="brand-solid flex h-11 items-center gap-1.5 rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-50"
                >
                  <Send size={14} aria-hidden />
                  {sending ? 'Отправляем…' : 'Отправить'}
                </button>
              </form>
            </>
          )}
        </section>

        {/* ── Колонка 3: карточка клиента ────────────────────────────── */}
        <aside className="inbox__customer">
          {selected ? (
            <>
              <div className="flex flex-col items-center text-center">
                <span className="inbox__avatar inbox__avatar--xl" aria-hidden>
                  {initial(selected.customerName)}
                </span>
                <h3 className="mb-1.5 mt-3 text-base font-bold" style={{ color: 'var(--ink)' }}>
                  {selected.customerName}
                </h3>
                <span
                  className="rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase leading-none"
                  style={
                    SOURCE_BADGE[selected.source]
                      ? {
                          background: SOURCE_BADGE[selected.source].bg,
                          color: SOURCE_BADGE[selected.source].color,
                        }
                      : { background: 'var(--surface-2)', color: 'var(--ink-3)' }
                  }
                >
                  {sourceLabel(selected.source)}
                </span>
              </div>

              <dl className="inbox__facts my-5 grid">
                <div>
                  <dt>Контакт</dt>
                  <dd>{selected.customerPhone || selected.customerUsername || 'Не указан'}</dd>
                </div>
                <div>
                  <dt>ID диалога</dt>
                  <dd>{selected.externalChatId}</dd>
                </div>
                {selected.externalLeadId && (
                  <div>
                    <dt>Сделка amoCRM</dt>
                    <dd>#{selected.externalLeadId}</dd>
                  </div>
                )}
                <div>
                  <dt>Последняя активность</dt>
                  <dd>{fmtRelative(selected.lastMessageAt)}</dd>
                </div>
              </dl>

              {/* Сделки в воронке заводятся из этих же диалогов по external_key. */}
              {deal && (
                <Link
                  href="/dashboard/deals"
                  className="card-hover mb-5 block rounded-2xl px-3.5 py-3"
                  style={{ border: '1px solid var(--line)', background: 'var(--brand-soft)' }}
                >
                  <span className="eyebrow" style={{ color: 'var(--brand-ink)' }}>Сделка в воронке</span>
                  <span className="mt-1.5 block text-[12.5px] font-bold" style={{ color: 'var(--ink)' }}>
                    {deal.title}
                  </span>
                  <span className="mt-1 block text-[11px]" style={{ color: 'var(--ink-2)' }}>
                    {deal.stageName} · {fmtAmount(deal.amount, deal.currency)}
                  </span>
                </Link>
              )}

              <label className="inbox__note grid gap-2 text-[10px] font-bold" style={{ color: 'var(--ink-3)' }}>
                ЗАМЕТКА МЕНЕДЖЕРА
                <textarea
                  rows={5}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Что важно помнить о клиенте"
                />
              </label>
              <button
                type="button"
                onClick={() => void saveNote()}
                disabled={notePending || note === selected.notes}
                className="mt-2.5 w-full rounded-xl py-2.5 text-[11px] font-bold disabled:opacity-45"
                style={{ border: '1px solid var(--line-strong)', color: 'var(--ink)' }}
              >
                {notePending ? 'Сохраняем…' : 'Сохранить заметку'}
              </button>
            </>
          ) : (
            <div className="inbox__empty">
              <span className="eyebrow">Карточка клиента</span>
              <span>Контакты, источник, сделка и заметки откроются вместе с диалогом.</span>
            </div>
          )}

          <div className="mt-6 pt-4" style={{ borderTop: '1px solid var(--line)' }}>
            <b className="text-[11px] font-extrabold" style={{ color: 'var(--ink)' }}>Управление ботом</b>
            <p className="mt-2 text-[10px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>
              Промпты, модель и подтверждение ответов — в разделе «Настройки бота».
              Здесь переключается только автоответ в конкретном диалоге.
            </p>
          </div>
        </aside>
      </div>

      <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>
        Переписка живёт на витрине «МОСТОВОЙ»: она владеет ботом, Telegram и amoCRM.
        Список обновляется автоматически раз в {POLL_MS / 1000} секунд.
      </p>
    </div>
  )
}

function ChannelPill({ label, on }: { label: string; on: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-[11px] font-bold"
      style={
        on
          ? { border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink-2)' }
          : { border: '1px solid var(--warn-border-2)', background: 'var(--warn-tint-2)', color: 'var(--warn-strong-3)' }
      }
    >
      <i
        className="block h-[7px] w-[7px] rounded-full"
        style={
          on
            ? { background: 'var(--ok-live)', boxShadow: '0 0 0 4px rgba(32,180,106,.14)' }
            : { background: 'var(--warn-base-2)' }
        }
        aria-hidden
      />
      {label}
      {!on && ' — настройте'}
    </span>
  )
}

'use client'

// «Ответы бота»: очередь черновиков ИИ витрины «МОСТОВОЙ».
// Менеджер видит сообщение клиента, пересказ диалога от гипервизора и сам
// черновик — правит текст при необходимости и либо отправляет его клиенту,
// либо отклоняет с причиной (её витрина использует для обучения).

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { BotMessageSquare, Check, Eye, MessageSquare, Sparkles, X } from 'lucide-react'
import {
  approveShopReply,
  getShopApprovals,
  rejectShopReply,
  type ShopApprovalsData,
} from '@/actions/mostovoy-approvals'
import { SHOP_APPROVAL_FILTERS, type ShopApproval, type ShopApprovalFilter } from '@/lib/models/mostovoy'

/** Тот же интервал, что у «Диалогов»: один SELECT по SQLite — опрос дешёвый. */
const POLL_MS = 15_000

const FILTER_LABELS: Record<ShopApprovalFilter, string> = {
  pending: 'Ждут решения',
  approved: 'Отправленные',
  rejected: 'Отклонённые',
  all: 'Все',
}

const SOURCE_LABELS: Record<string, string> = {
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  amocrm: 'amoCRM',
}

// Светлые насыщенные плашки — как в «Диалогах».
const SOURCE_BADGE: Record<string, { bg: string; color: string }> = {
  telegram: { bg: 'var(--info-soft)', color: 'var(--info)' },
  whatsapp: { bg: 'var(--ok-soft-2)', color: 'var(--ok-ink-2)' },
  amocrm: { bg: 'var(--ok-soft-2)', color: 'var(--ok-ink-2)' },
  instagram: { bg: 'var(--brand-soft)', color: 'var(--brand-ink)' },
}

const STATUS_BADGE: Record<ShopApproval['status'], { label: string; bg: string; color: string }> = {
  pending: { label: 'Ждёт решения', bg: 'var(--warn-soft-alt)', color: 'var(--warn-strong-3)' },
  approved: { label: 'Отправлен клиенту', bg: 'var(--ok-soft-2)', color: 'var(--ok-ink-2)' },
  rejected: { label: 'Отклонён', bg: 'var(--brand-soft)', color: 'var(--brand-ink)' },
}

function sourceLabel(source: string) {
  return SOURCE_LABELS[source] ?? source
}

function initial(name: string) {
  return name.trim().charAt(0).toLocaleUpperCase('ru') || '?'
}

function fmtRelative(iso: string) {
  const date = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`)
  if (Number.isNaN(date.getTime())) return '—'
  const diffMin = Math.round((Date.now() - date.getTime()) / 60_000)
  if (diffMin < 1) return 'только что'
  if (diffMin < 60) return `${diffMin} мин назад`
  const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  const today = new Date()
  if (date.toDateString() === today.toDateString()) return `сегодня ${time}`
  const yesterday = new Date(today.getTime() - 86_400_000)
  if (date.toDateString() === yesterday.toDateString()) return `вчера ${time}`
  return `${date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })} ${time}`
}

export function ShopApprovalsClient({ initialData }: { initialData: ShopApprovalsData }) {
  const [data, setData] = useState(initialData)
  const [filter, setFilter] = useState<ShopApprovalFilter>('pending')
  const [loading, setLoading] = useState(false)
  // Правки черновиков живут отдельно от списка: опрос не должен затирать текст,
  // который менеджер уже начал редактировать.
  const [drafts, setDrafts] = useState<Record<number, string>>({})
  const [reasons, setReasons] = useState<Record<number, string>>({})
  const [rejecting, setRejecting] = useState<number | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)

  const load = useCallback(
    async (next: ShopApprovalFilter, showLoader: boolean) => {
      if (showLoader) setLoading(true)
      const result = await getShopApprovals(next)
      if (result.ok) setData(result.data)
      else if (showLoader) toast.error(result.error)
      if (showLoader) setLoading(false)
    },
    []
  )

  useEffect(() => {
    const timer = setInterval(() => void load(filter, false), POLL_MS)
    return () => clearInterval(timer)
  }, [filter, load])

  function changeFilter(next: ShopApprovalFilter) {
    setFilter(next)
    void load(next, true)
  }

  async function approve(item: ShopApproval) {
    if (busyId !== null) return
    const text = drafts[item.id] ?? item.editedReply ?? item.aiReply
    setBusyId(item.id)
    const result = await approveShopReply(item.id, text)
    if (result.ok) {
      toast.success(
        text.trim() === item.aiReply.trim()
          ? 'Ответ отправлен клиенту'
          : 'Отредактированный ответ отправлен клиенту'
      )
      setDrafts((prev) => {
        const next = { ...prev }
        delete next[item.id]
        return next
      })
      await load(filter, false)
    } else {
      toast.error(result.error)
    }
    setBusyId(null)
  }

  async function reject(item: ShopApproval) {
    if (busyId !== null) return
    const reason = (reasons[item.id] ?? '').trim()
    if (!reason) {
      toast.error('Укажите причину отклонения — бот учится на ней')
      return
    }
    setBusyId(item.id)
    const result = await rejectShopReply(item.id, reason)
    if (result.ok) {
      toast.success('Черновик отклонён')
      setRejecting(null)
      setReasons((prev) => {
        const next = { ...prev }
        delete next[item.id]
        return next
      })
      await load(filter, false)
    } else {
      toast.error(result.error)
    }
    setBusyId(null)
  }

  const tiles = useMemo(
    () =>
      [
        ['Ждут решения', data.counters.pending],
        ['Отправлено', data.counters.approved],
        ['Отклонено', data.counters.rejected],
        ['Всего черновиков', data.counters.total],
      ] as const,
    [data.counters]
  )

  return (
    <div className="flex flex-col gap-4 p-4 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="kicker">Human in the loop</p>
          <h1 className="block-title span-rule mt-2">Ответы бота</h1>
          <p className="mt-2 max-w-xl text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
            Проверьте черновик, при необходимости отредактируйте и отправьте клиенту.
            Отклонённые ответы с причиной бот использует для обучения.
          </p>
        </div>
        <span
          className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-[11px] font-bold"
          style={
            data.aiEnabled
              ? { border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink-2)' }
              : { border: '1px solid var(--warn-border-2)', background: 'var(--warn-tint-2)', color: 'var(--warn-strong-3)' }
          }
        >
          <i
            className="block h-[7px] w-[7px] rounded-full"
            style={
              data.aiEnabled
                ? { background: 'var(--ok-live)', boxShadow: '0 0 0 4px rgba(32,180,106,.14)' }
                : { background: 'var(--warn-base-2)' }
            }
            aria-hidden
          />
          {data.aiEnabled ? `ИИ работает · ${data.model}` : 'ИИ выключен — нужен ключ провайдера'}
        </span>
      </header>

      {/* Подтверждение выключено — очередь и не должна наполняться. */}
      {!data.approvalEnabled && (
        <div
          className="flex flex-wrap items-center gap-3 rounded-2xl px-5 py-4"
          style={{ border: '1px solid var(--warn-border-2)', background: 'var(--warn-tint-2)' }}
        >
          <Sparkles size={16} style={{ color: 'var(--warn-strong-3)' }} aria-hidden />
          <p className="min-w-[240px] flex-1 text-[12.5px]" style={{ color: 'var(--warn-strong-3)' }}>
            <b>Подтверждение ответов выключено.</b> Бот отвечает клиентам сразу, поэтому новые
            черновики сюда не попадают — в списке останется только история прошлых решений.
          </p>
          <Link
            href="/dashboard/bot-settings"
            className="rounded-xl px-3.5 py-2 text-[11px] font-bold"
            style={{ border: '1px solid var(--warn-border-2)', background: 'var(--surface)', color: 'var(--warn-strong-3)' }}
          >
            Включить в настройках бота
          </Link>
        </div>
      )}

      <div
        className="grid gap-2.5"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}
      >
        {tiles.map(([label, value]) => (
          <article
            key={label}
            className="card-hover rounded-2xl px-4 py-3.5"
            style={{ border: '1px solid var(--line)', background: 'var(--surface)' }}
          >
            <strong className="tnum block text-xl leading-none" style={{ color: 'var(--brand)' }}>
              {value.toLocaleString('ru-RU')}
            </strong>
            <span className="mt-2 block text-[11px]" style={{ color: 'var(--ink-3)' }}>
              {label}
            </span>
          </article>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {SHOP_APPROVAL_FILTERS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => changeFilter(value)}
            className="rounded-xl px-3.5 py-2 text-[11.5px] font-bold transition-colors"
            style={
              filter === value
                ? { background: 'var(--accent-from)', color: 'var(--on-brand)' }
                : { border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink-2)' }
            }
          >
            {FILTER_LABELS[value]}
          </button>
        ))}
      </div>

      {loading ? (
        <div
          className="rounded-2xl px-5 py-10 text-center text-[12.5px]"
          style={{ border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink-3)' }}
        >
          Загружаем черновики…
        </div>
      ) : data.approvals.length === 0 ? (
        <div
          className="flex flex-col items-center gap-2.5 rounded-2xl px-6 py-14 text-center"
          style={{ border: '1px solid var(--line)', background: 'var(--surface)' }}
        >
          <span
            className="grid h-12 w-12 place-items-center rounded-2xl"
            style={{ background: 'var(--brand-soft)' }}
            aria-hidden
          >
            <BotMessageSquare size={22} style={{ color: 'var(--brand-ink)' }} />
          </span>
          <b className="text-[15px]" style={{ color: 'var(--ink)' }}>
            {filter === 'pending' ? 'Очередь пуста' : 'Ничего не найдено'}
          </b>
          <span className="max-w-md text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
            {filter === 'pending'
              ? data.approvalEnabled
                ? 'Все черновики разобраны. Новый появится, как только клиент напишет боту витрины.'
                : 'Подтверждение выключено — бот отправляет ответы сам, поэтому очередь не наполняется.'
              : 'В этом фильтре записей нет — попробуйте другой.'}
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          {data.approvals.map((item) => {
            const badge = SOURCE_BADGE[item.source]
            const status = STATUS_BADGE[item.status]
            const pending = item.status === 'pending'
            const draft = drafts[item.id] ?? item.editedReply ?? item.aiReply
            const busy = busyId === item.id

            return (
              <article
                key={item.id}
                className="rounded-2xl p-5"
                style={{ border: '1px solid var(--line)', background: 'var(--surface)' }}
              >
                <header className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-extrabold"
                      style={{ background: 'var(--brand-soft)', color: 'var(--brand-ink)' }}
                      aria-hidden
                    >
                      {initial(item.customerName)}
                    </span>
                    <div className="min-w-0">
                      <b className="block truncate text-[13.5px]" style={{ color: 'var(--ink)' }}>
                        {item.customerName}
                      </b>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5">
                        <em
                          className="rounded-full px-1.5 py-0.5 text-[8.5px] font-extrabold uppercase not-italic leading-none"
                          style={
                            badge
                              ? { background: badge.bg, color: badge.color }
                              : { background: 'var(--surface-2)', color: 'var(--ink-3)' }
                          }
                        >
                          {sourceLabel(item.source)}
                        </em>
                        <small className="text-[10.5px]" style={{ color: 'var(--ink-3)' }}>
                          {fmtRelative(item.createdAt)}
                        </small>
                      </span>
                    </div>
                  </div>
                  <span
                    className="rounded-full px-2.5 py-1 text-[9.5px] font-extrabold uppercase leading-none"
                    style={{ background: status.bg, color: status.color }}
                  >
                    {status.label}
                  </span>
                </header>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <Quote label="Сообщение клиента" text={item.customerMessage} />
                  {item.summary && <Quote label="Гипервизор о диалоге" text={item.summary} accent />}
                </div>

                {item.rejectReason && (
                  <div className="mt-3">
                    <Quote label="Причина отклонения" text={item.rejectReason} danger />
                  </div>
                )}

                <label className="mt-4 block">
                  <span
                    className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-wide"
                    style={{ color: 'var(--ink-3)' }}
                  >
                    Черновик ответа
                  </span>
                  <textarea
                    rows={5}
                    maxLength={4000}
                    value={draft}
                    disabled={!pending || busy}
                    onChange={(e) =>
                      setDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))
                    }
                    className="w-full resize-y rounded-xl px-3.5 py-3 text-[13px] leading-relaxed outline-none disabled:opacity-70"
                    style={{
                      border: '1px solid var(--line)',
                      background: pending ? 'var(--surface)' : 'var(--surface-2)',
                      color: 'var(--ink)',
                    }}
                  />
                </label>

                {pending && draft.trim() !== item.aiReply.trim() && (
                  <p className="mt-1.5 text-[10.5px]" style={{ color: 'var(--brand-ink)' }}>
                    Текст изменён — клиенту уйдёт ваша версия, а правка попадёт в обучающую выборку.
                  </p>
                )}

                <footer className="mt-4 flex flex-wrap items-center gap-2.5">
                  <small className="mr-auto text-[10.5px]" style={{ color: 'var(--ink-3)' }}>
                    {item.model || 'модель не указана'}
                    {item.decidedAt ? ` · решение ${fmtRelative(item.decidedAt)}` : ''}
                  </small>

                  <Link
                    href="/dashboard/dialogs"
                    className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[11px] font-bold"
                    style={{ border: '1px solid var(--line-strong)', color: 'var(--ink)' }}
                  >
                    <Eye size={13} aria-hidden />
                    Открыть диалог
                  </Link>

                  {pending && (
                    <>
                      <button
                        type="button"
                        onClick={() => setRejecting(rejecting === item.id ? null : item.id)}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[11px] font-bold disabled:opacity-50"
                        style={{ border: '1px solid var(--line-strong)', color: 'var(--brand-ink)' }}
                      >
                        <X size={13} aria-hidden />
                        Отклонить
                      </button>
                      <button
                        type="button"
                        onClick={() => void approve(item)}
                        disabled={busy || !draft.trim()}
                        className="brand-solid inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[11px] font-bold text-white disabled:opacity-50"
                      >
                        <Check size={13} aria-hidden />
                        {busy ? 'Отправляем…' : 'Подтвердить и отправить'}
                      </button>
                    </>
                  )}
                </footer>

                {pending && rejecting === item.id && (
                  <div
                    className="mt-3 rounded-xl p-3.5"
                    style={{ border: '1px solid var(--line)', background: 'var(--surface-2)' }}
                  >
                    <label
                      className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-wide"
                      style={{ color: 'var(--ink-3)' }}
                    >
                      Почему ответ не годится
                    </label>
                    <textarea
                      rows={2}
                      maxLength={2000}
                      autoFocus
                      value={reasons[item.id] ?? ''}
                      onChange={(e) => setReasons((prev) => ({ ...prev, [item.id]: e.target.value }))}
                      placeholder="Например: придумал скидку, которой нет в каталоге"
                      className="w-full resize-y rounded-xl px-3 py-2.5 text-[12.5px] outline-none"
                      style={{
                        border: '1px solid var(--line)',
                        background: 'var(--surface)',
                        color: 'var(--ink)',
                      }}
                    />
                    <div className="mt-2.5 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setRejecting(null)}
                        className="rounded-xl px-3.5 py-2 text-[11px] font-bold"
                        style={{ border: '1px solid var(--line-strong)', color: 'var(--ink-2)' }}
                      >
                        Отмена
                      </button>
                      <button
                        type="button"
                        onClick={() => void reject(item)}
                        disabled={busy || !(reasons[item.id] ?? '').trim()}
                        className="brand-solid rounded-xl px-4 py-2 text-[11px] font-bold text-white disabled:opacity-50"
                      >
                        {busy ? 'Отклоняем…' : 'Отклонить черновик'}
                      </button>
                    </div>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}

      <p className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--ink-3)' }}>
        <MessageSquare size={12} aria-hidden />
        Очередь живёт на витрине «МОСТОВОЙ» и обновляется автоматически раз в {POLL_MS / 1000} секунд.
      </p>
    </div>
  )
}

function Quote({
  label,
  text,
  accent,
  danger,
}: {
  label: string
  text: string
  accent?: boolean
  danger?: boolean
}) {
  return (
    <div
      className="rounded-xl px-3.5 py-3"
      style={{
        border: '1px solid var(--line)',
        background: danger ? 'var(--brand-soft)' : accent ? 'var(--brand-soft)' : 'var(--surface-2)',
      }}
    >
      <span
        className="mb-1 block text-[10px] font-extrabold uppercase tracking-wide"
        style={{ color: danger || accent ? 'var(--brand-ink)' : 'var(--ink-3)' }}
      >
        {label}
      </span>
      <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed" style={{ color: 'var(--ink)' }}>
        {text}
      </p>
    </div>
  )
}

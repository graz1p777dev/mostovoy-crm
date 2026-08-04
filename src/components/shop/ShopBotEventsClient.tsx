'use client'

// «Отчёты бота»: состояние бота витрины и журнал прохождения сообщений.
// В старой админке этот журнал был чёрным терминалом — здесь та же лента,
// но на светлой бумаге, как и весь остальной интерфейс CRM.

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Activity, RefreshCw, ScrollText } from 'lucide-react'
import { getShopBotEvents } from '@/actions/mostovoy-developer'
import type { ShopBotEvent, ShopBotStatus } from '@/lib/models/mostovoy'

const POLL_MS = 10_000

// Журнал — единственная намеренно тёмная плашка в CRM: консоль и должна
// выглядеть как консоль. Цвета живут в бренд-конфиге (BRAND.terminal), чтобы
// клиент со светлым журналом выражался тем же кодом.
const TERMINAL = {
  bg: 'var(--term-bg)',
  border: 'var(--term-border)',
  text: 'var(--term-text)',
  muted: 'var(--term-muted)',
  time: 'var(--term-time)',
  stage: 'var(--term-stage)',
  rule: 'var(--term-rule)',
} as const

/** Уровни витрины: info | warn | error. */
const LEVEL_COLOR: Record<string, string> = {
  info: 'var(--term-info)',
  warn: 'var(--term-warn)',
  error: 'var(--term-error)',
}

const STAGE_LABELS: Record<string, string> = {
  inbox: 'Входящие',
  generation: 'Генерация',
  hypervisor: 'Гипервизор',
  approval: 'Подтверждение',
  delivery: 'Доставка',
  learning: 'Обучение',
  laboratory: 'Лаборатория',
  settings: 'Настройки',
}

function stageLabel(stage: string) {
  return STAGE_LABELS[stage] ?? stage
}

function fmtTime(iso: string) {
  const date = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`)
  if (Number.isNaN(date.getTime())) return '--:--:--'
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function fmtDay(iso: string) {
  const date = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
}

function fmtDetails(details: ShopBotEvent['details']) {
  if (!details || typeof details !== 'object') return ''
  return Object.entries(details)
    .map(([key, value]) => `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .join('  ')
    .slice(0, 420)
}

interface Props {
  status: ShopBotStatus
  initialEvents: ShopBotEvent[]
}

export function ShopBotEventsClient({ status, initialEvents }: Props) {
  const [events, setEvents] = useState(initialEvents)
  const [level, setLevel] = useState<'all' | 'error'>('all')
  const [live, setLive] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = useCallback(
    async (next: 'all' | 'error', announce: boolean) => {
      if (announce) setBusy(true)
      const result = await getShopBotEvents(next, 200)
      if (result.ok) setEvents(result.data)
      else if (announce) toast.error(result.error)
      if (announce) setBusy(false)
    },
    []
  )

  useEffect(() => {
    if (!live) return
    const timer = setInterval(() => void load(level, false), POLL_MS)
    return () => clearInterval(timer)
  }, [live, level, load])

  function changeLevel(next: 'all' | 'error') {
    setLevel(next)
    void load(next, true)
  }

  // Разбивка по этапам: где именно бот проводит свою работу и где спотыкается.
  const byStage = useMemo(() => {
    const counts = new Map<string, { total: number; errors: number }>()
    for (const item of events) {
      const row = counts.get(item.stage) ?? { total: 0, errors: 0 }
      row.total += 1
      if (item.level === 'error') row.errors += 1
      counts.set(item.stage, row)
    }
    return [...counts.entries()]
      .map(([stage, row]) => ({ stage, ...row }))
      .sort((a, b) => b.total - a.total)
  }, [events])

  const stageMax = Math.max(1, ...byStage.map((row) => row.total))
  const errorsInFeed = events.filter((item) => item.level === 'error').length

  const settings = status.settings
  const tiles: [string, string, string][] = [
    ['Ошибок за 24 часа', String(status.errors24h), status.errors24h > 0 ? 'var(--series-negative-text)' : 'var(--series-positive-text)'],
    ['Ждут решения', String(status.approvals.pending), 'var(--brand)'],
    ['Отправлено', String(status.approvals.approved), 'var(--series-positive-text)'],
    ['Отклонено', String(status.approvals.rejected), 'var(--brand-ink)'],
    ['Всего черновиков', String(status.approvals.total), 'var(--brand)'],
    ['Ошибок в ленте', String(errorsInFeed), errorsInFeed > 0 ? 'var(--series-negative-text)' : 'var(--series-positive-text)'],
  ]

  return (
    <div className="flex flex-col gap-4 p-4 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="kicker">Диагностика бота</p>
          <h1 className="block-title span-rule mt-2">Отчёты бота</h1>
          <p className="mt-2 max-w-xl text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
            Состояние бота витрины и журнал прохождения сообщений: приём, генерация черновика,
            гипервизор, подтверждение и доставка клиенту.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Pill ok={status.enabled} label={status.enabled ? 'ИИ работает' : 'ИИ выключен'} />
          <Pill ok label={`Модель · ${settings.model}`} />
          <Pill
            ok={settings.approvalEnabled}
            label={settings.approvalEnabled ? 'Подтверждение включено' : 'Отвечает без подтверждения'}
          />
          {settings.aggressiveLearning && <Pill ok label="Агрессивное обучение" />}
        </div>
      </header>

      <div
        className="grid gap-2.5"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}
      >
        {tiles.map(([label, value, color]) => (
          <article
            key={label}
            className="card-hover rounded-2xl px-4 py-3.5"
            style={{ border: '1px solid var(--line)', background: 'var(--surface)' }}
          >
            <strong className="tnum block text-xl leading-none" style={{ color }}>
              {value}
            </strong>
            <span className="mt-2 block text-[11px]" style={{ color: 'var(--ink-3)' }}>
              {label}
            </span>
          </article>
        ))}
      </div>

      {status.approvals.pending > 0 && settings.approvalEnabled && (
        <div
          className="flex flex-wrap items-center gap-3 rounded-2xl px-5 py-4"
          style={{ border: '1px solid var(--line)', background: 'var(--brand-soft)' }}
        >
          <p className="min-w-[240px] flex-1 text-[12.5px]" style={{ color: 'var(--ink)' }}>
            В очереди <b>{status.approvals.pending}</b> черновиков ждут решения менеджера —
            пока их не подтвердят, клиент ответа не получит.
          </p>
          <Link
            href="/dashboard/bot-approvals"
            className="brand-solid rounded-xl px-3.5 py-2 text-[11px] font-bold text-white"
          >
            Открыть «Ответы бота»
          </Link>
        </div>
      )}

      <section
        className="rounded-2xl p-5"
        style={{ border: '1px solid var(--line)', background: 'var(--surface)' }}
      >
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <span
            className="grid h-8 w-8 place-items-center rounded-xl"
            style={{ background: 'var(--brand-soft)' }}
            aria-hidden
          >
            <Activity size={15} style={{ color: 'var(--brand-ink)' }} />
          </span>
          <h2 className="mr-auto text-sm font-bold" style={{ color: 'var(--ink)' }}>
            Этапы пайплайна в текущей ленте
          </h2>
        </div>
        {byStage.length === 0 ? (
          <EmptyBlock text="Событий ещё не было." />
        ) : (
          <div className="flex flex-col gap-3">
            {byStage.map((row) => (
              <div key={row.stage}>
                <div className="mb-1.5 flex justify-between text-[11.5px]">
                  <span style={{ color: 'var(--ink)' }}>{stageLabel(row.stage)}</span>
                  <span className="tnum" style={{ color: 'var(--ink-3)' }}>
                    {row.total}
                    {row.errors > 0 && (
                      <b className="ml-1.5" style={{ color: 'var(--brand-ink)' }}>· {row.errors} ошибок</b>
                    )}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full" style={{ background: 'var(--surface-2)' }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(row.total / stageMax) * 100}%`,
                      background: row.errors > 0 ? 'var(--series-negative-text)' : 'var(--accent-from)',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section
        className="rounded-2xl p-5"
        style={{ border: '1px solid var(--line)', background: 'var(--surface)' }}
      >
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <span
            className="grid h-8 w-8 place-items-center rounded-xl"
            style={{ background: 'var(--brand-soft)' }}
            aria-hidden
          >
            <ScrollText size={15} style={{ color: 'var(--brand-ink)' }} />
          </span>
          <h2 className="mr-auto text-sm font-bold" style={{ color: 'var(--ink)' }}>
            Журнал бота
          </h2>

          <button
            type="button"
            onClick={() => changeLevel('all')}
            className="rounded-xl px-3 py-1.5 text-[11px] font-bold"
            style={
              level === 'all'
                ? { background: 'var(--accent-from)', color: 'var(--on-brand)' }
                : { border: '1px solid var(--line)', background: 'var(--surface-2)', color: 'var(--ink-2)' }
            }
          >
            Все события
          </button>
          <button
            type="button"
            onClick={() => changeLevel('error')}
            className="rounded-xl px-3 py-1.5 text-[11px] font-bold"
            style={
              level === 'error'
                ? { background: 'var(--accent-from)', color: 'var(--on-brand)' }
                : { border: '1px solid var(--line)', background: 'var(--surface-2)', color: 'var(--ink-2)' }
            }
          >
            Только ошибки
          </button>
          <label
            className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-bold"
            style={{ border: '1px solid var(--line)', color: 'var(--ink-2)' }}
          >
            <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
            Live · {POLL_MS / 1000} с
          </label>
          <button
            type="button"
            onClick={() => void load(level, true)}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-bold disabled:opacity-50"
            style={{ border: '1px solid var(--line-strong)', color: 'var(--ink)' }}
          >
            <RefreshCw size={12} className={busy ? 'animate-spin' : ''} aria-hidden />
            Обновить
          </button>
        </div>

        {/* Тёмная консоль — намеренное исключение из светлого интерфейса. */}
        <div
          className="max-h-[520px] overflow-auto rounded-xl px-4 py-3.5 font-mono text-[11px] leading-[1.65]"
          style={{
            background: TERMINAL.bg,
            border: `1px solid ${TERMINAL.border}`,
            color: TERMINAL.text,
            boxShadow: 'inset 0 1px rgba(255,255,255,.045)',
          }}
          role="log"
          aria-live="polite"
        >
          {events.length === 0 ? (
            <div className="py-5" style={{ color: TERMINAL.time }}>
              ${' '}
              {level === 'error'
                ? 'Ошибок нет — бот отработал все сообщения чисто.'
                : 'Ожидаем события бота… Как только клиент напишет боту витрины, здесь появится вся цепочка.'}
            </div>
          ) : (
            events.map((item) => {
              const color = LEVEL_COLOR[item.level] ?? LEVEL_COLOR.info
              const details = fmtDetails(item.details)
              const error = item.level === 'error'
              return (
                <div
                  key={item.id}
                  className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 py-1"
                  style={{
                    borderBottom: `1px solid ${TERMINAL.rule}`,
                    background: error ? 'rgba(232,0,29,.08)' : undefined,
                  }}
                >
                  <time className="tnum shrink-0" style={{ color: TERMINAL.time }} title={item.createdAt}>
                    {fmtDay(item.createdAt)} {fmtTime(item.createdAt)}
                  </time>
                  <b className="shrink-0 text-[10px] uppercase" style={{ color }}>
                    {item.level}
                  </b>
                  <span className="shrink-0" style={{ color: error ? color : TERMINAL.stage }}>
                    {stageLabel(item.stage)}
                  </span>
                  <span style={{ color: error ? color : TERMINAL.text }}>
                    {item.message || item.event}
                  </span>
                  {item.conversationId !== null && (
                    <span style={{ color: TERMINAL.time }}>диалог #{item.conversationId}</span>
                  )}
                  {details && (
                    <code className="w-full break-all" style={{ color: TERMINAL.muted }}>
                      {details}
                    </code>
                  )}
                </div>
              )
            })
          )}
        </div>

        <p className="mt-3 text-[11px]" style={{ color: 'var(--ink-3)' }}>
          Последние {events.length} записей журнала витрины (bot_events), новые сверху.
        </p>
      </section>
    </div>
  )
}

function Pill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-[11px] font-bold"
      style={
        ok
          ? { border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink-2)' }
          : { border: '1px solid var(--warn-border-2)', background: 'var(--warn-tint-2)', color: 'var(--warn-strong-3)' }
      }
    >
      <i
        className="block h-[7px] w-[7px] rounded-full"
        style={
          ok
            ? { background: 'var(--ok-live)', boxShadow: '0 0 0 4px rgba(32,180,106,.14)' }
            : { background: 'var(--warn-base-2)' }
        }
        aria-hidden
      />
      {label}
    </span>
  )
}

function EmptyBlock({ text }: { text: string }) {
  return (
    <div
      className="rounded-xl px-4 py-10 text-center text-[12px]"
      style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}
    >
      {text}
    </div>
  )
}

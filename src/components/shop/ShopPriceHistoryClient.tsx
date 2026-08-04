'use client'

// «Обновления» — журнал изменения цен витрины «МОСТОВОЙ» (price_history).
// Одна запись = один пересчёт цены товара: откуда пришёл (Telegram-канал или
// админка), с какой цены на какую и когда. Название и слаг денормализованы —
// товар мог быть переименован или скрыт, запись остаётся читаемой.

import { useMemo, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, PlusCircle, Search, TrendingUp } from 'lucide-react'
import type { ShopPriceChange } from '@/lib/models/mostovoy'

type SourceFilter = 'all' | 'telegram' | 'admin'
type KindFilter = 'all' | 'up' | 'down' | 'new'

const SOURCE_LABELS: Record<string, string> = {
  telegram: 'Telegram-канал',
  admin: 'Админка CRM',
}

const SOURCE_BADGE: Record<string, { bg: string; color: string }> = {
  telegram: { bg: 'var(--info-soft)', color: 'var(--info)' },
  admin: { bg: 'var(--brand-soft)', color: 'var(--brand-ink)' },
}

/** Три вида записи: подорожание, удешевление и первая цена нового товара. */
function kindOf(change: ShopPriceChange): Exclude<KindFilter, 'all'> {
  if (change.oldPrice === null) return 'new'
  return change.newPrice > change.oldPrice ? 'up' : 'down'
}

function fmtPrice(value: number, currency: string) {
  return `${value.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ${currency}`
}

function fmtDate(iso: string) {
  const date = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function ShopPriceHistoryClient({ changes }: { changes: ShopPriceChange[] }) {
  const [query, setQuery] = useState('')
  const [source, setSource] = useState<SourceFilter>('all')
  const [kind, setKind] = useState<KindFilter>('all')

  const stats = useMemo(() => {
    let up = 0
    let down = 0
    let created = 0
    for (const change of changes) {
      const value = kindOf(change)
      if (value === 'up') up += 1
      else if (value === 'down') down += 1
      else created += 1
    }
    return { total: changes.length, up, down, created }
  }, [changes])

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('ru')
    return changes.filter((change) => {
      if (source !== 'all' && change.source !== source) return false
      if (kind !== 'all' && kindOf(change) !== kind) return false
      if (!needle) return true
      return [change.productName, change.productSlug]
        .filter(Boolean)
        .some((field) => String(field).toLocaleLowerCase('ru').includes(needle))
    })
  }, [changes, query, source, kind])

  const sources: [SourceFilter, string][] = [
    ['all', 'Все источники'],
    ['telegram', 'Telegram-канал'],
    ['admin', 'Админка CRM'],
  ]
  const kinds: [KindFilter, string][] = [
    ['all', 'Любые'],
    ['up', 'Подорожали'],
    ['down', 'Подешевели'],
    ['new', 'Новая цена'],
  ]

  return (
    <div className="flex flex-col gap-4 p-4 md:p-8">
      <header>
        <p className="kicker">Журнал каталога</p>
        <h1 className="block-title span-rule mt-2">Обновления</h1>
        <p className="mt-2 max-w-xl text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
          Каждое изменение цены на витрине: что за товар, было → стало и откуда пришло обновление.
          Записи из Telegram появляются автосинхронизацией каталога.
        </p>
      </header>

      <div
        className="grid gap-2.5"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}
      >
        <Tile label="Всего записей" value={stats.total} icon={<TrendingUp size={13} />} color="var(--brand)" />
        <Tile label="Подорожали" value={stats.up} icon={<ArrowUpRight size={13} />} color="var(--series-negative-text)" />
        <Tile label="Подешевели" value={stats.down} icon={<ArrowDownRight size={13} />} color="var(--series-positive-text)" />
        <Tile label="Первая цена" value={stats.created} icon={<PlusCircle size={13} />} color="var(--warn-strong)" />
      </div>

      <div
        className="flex flex-wrap items-center gap-2.5 rounded-2xl px-4 py-3.5"
        style={{ border: '1px solid var(--line)', background: 'var(--surface)' }}
      >
        <label
          className="flex min-w-[210px] flex-1 items-center gap-2 rounded-xl px-3 py-2"
          style={{ border: '1px solid var(--line)', background: 'var(--surface-2)' }}
        >
          <Search size={14} style={{ color: 'var(--ink-3)' }} aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Название товара или слаг"
            aria-label="Поиск по журналу цен"
            className="w-full bg-transparent text-[12.5px] outline-none"
            style={{ color: 'var(--ink)' }}
          />
        </label>

        <div className="flex flex-wrap gap-1.5">
          {sources.map(([value, label]) => (
            <Chip key={value} active={source === value} onClick={() => setSource(value)} label={label} />
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {kinds.map(([value, label]) => (
            <Chip key={value} active={kind === value} onClick={() => setKind(value)} label={label} />
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div
          className="flex flex-col items-center gap-2.5 rounded-2xl px-6 py-14 text-center"
          style={{ border: '1px solid var(--line)', background: 'var(--surface)' }}
        >
          <span
            className="grid h-12 w-12 place-items-center rounded-2xl"
            style={{ background: 'var(--brand-soft)' }}
            aria-hidden
          >
            <TrendingUp size={22} style={{ color: 'var(--brand-ink)' }} />
          </span>
          <b className="text-[15px]" style={{ color: 'var(--ink)' }}>
            {changes.length === 0 ? 'Цены ещё не менялись' : 'Ничего не найдено'}
          </b>
          <span className="max-w-md text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
            {changes.length === 0
              ? 'Как только цена товара изменится в админке или прилетит из Telegram-канала, запись появится здесь.'
              : 'Измените запрос или снимите фильтры.'}
          </span>
        </div>
      ) : (
        <div
          className="overflow-hidden rounded-2xl"
          style={{ border: '1px solid var(--line)', background: 'var(--surface)' }}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--ink-3)' }}>
                  <th className="px-5 py-3 text-left font-bold">Товар</th>
                  <th className="px-3 py-3 text-right font-bold">Было</th>
                  <th className="px-3 py-3 text-right font-bold">Стало</th>
                  <th className="px-3 py-3 text-right font-bold">Изменение</th>
                  <th className="px-3 py-3 text-left font-bold">Источник</th>
                  <th className="px-5 py-3 text-right font-bold">Когда</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((change) => {
                  const variant = kindOf(change)
                  const delta =
                    change.oldPrice === null ? null : change.newPrice - change.oldPrice
                  const percent =
                    change.oldPrice && change.oldPrice !== 0
                      ? ((change.newPrice - change.oldPrice) / change.oldPrice) * 100
                      : null
                  const badge = SOURCE_BADGE[change.source]
                  const deltaColor =
                    variant === 'up' ? 'var(--series-negative-text)' : variant === 'down' ? 'var(--series-positive-text)' : 'var(--warn-strong)'

                  return (
                    <tr key={change.id} style={{ borderTop: '1px solid var(--line)' }}>
                      <td className="px-5 py-3">
                        <b className="block" style={{ color: 'var(--ink)' }}>
                          {change.productName}
                        </b>
                        {change.productSlug && (
                          <small className="mt-0.5 block font-mono text-[10px]" style={{ color: 'var(--ink-3)' }}>
                            {change.productSlug}
                          </small>
                        )}
                      </td>
                      <td className="tnum whitespace-nowrap px-3 py-3 text-right" style={{ color: 'var(--ink-3)' }}>
                        {change.oldPrice === null ? '—' : fmtPrice(change.oldPrice, change.currency)}
                      </td>
                      <td
                        className="tnum whitespace-nowrap px-3 py-3 text-right font-bold"
                        style={{ color: 'var(--ink)' }}
                      >
                        {fmtPrice(change.newPrice, change.currency)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right">
                        {delta === null ? (
                          <span
                            className="rounded-full px-2 py-0.5 text-[9.5px] font-extrabold uppercase leading-none"
                            style={{ background: 'var(--warn-soft-alt)', color: 'var(--warn-strong)' }}
                          >
                            новая цена
                          </span>
                        ) : (
                          <span className="tnum inline-flex items-center gap-1 font-bold" style={{ color: deltaColor }}>
                            {variant === 'up' ? <ArrowUpRight size={13} aria-hidden /> : <ArrowDownRight size={13} aria-hidden />}
                            {delta > 0 ? '+' : ''}
                            {delta.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}
                            {percent !== null && (
                              <small className="font-semibold" style={{ color: 'var(--ink-3)' }}>
                                ({percent > 0 ? '+' : ''}
                                {percent.toFixed(Math.abs(percent) >= 10 ? 0 : 1)}%)
                              </small>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <em
                          className="rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase not-italic leading-none"
                          style={
                            badge
                              ? { background: badge.bg, color: badge.color }
                              : { background: 'var(--surface-2)', color: 'var(--ink-3)' }
                          }
                        >
                          {SOURCE_LABELS[change.source] ?? change.source}
                        </em>
                      </td>
                      <td className="tnum whitespace-nowrap px-5 py-3 text-right" style={{ color: 'var(--ink-3)' }}>
                        {fmtDate(change.changedAt)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>
        Показано {visible.length} из {changes.length} записей. Витрина отдаёт последние 500 изменений.
      </p>
    </div>
  )
}

function Tile({
  label,
  value,
  icon,
  color,
}: {
  label: string
  value: number
  icon: React.ReactNode
  color: string
}) {
  return (
    <article
      className="card-hover rounded-2xl px-4 py-3.5"
      style={{ border: '1px solid var(--line)', background: 'var(--surface)' }}
    >
      <div className="tnum flex items-center gap-1.5 text-xl font-bold leading-none" style={{ color }}>
        {icon}
        {value.toLocaleString('ru-RU')}
      </div>
      <span className="mt-2 block text-[11px]" style={{ color: 'var(--ink-3)' }}>
        {label}
      </span>
    </article>
  )
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl px-3 py-1.5 text-[11px] font-bold transition-colors"
      style={
        active
          ? { background: 'var(--accent-from)', color: 'var(--on-brand)' }
          : { border: '1px solid var(--line)', background: 'var(--surface-2)', color: 'var(--ink-2)' }
      }
    >
      {label}
    </button>
  )
}

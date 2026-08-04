'use client'

// «Аналитика бота»: во что обходится ИИ витрины «МОСТОВОЙ» и как менеджеры
// оценивают его ответы. Источники — GET /crm/developer/status и
// GET /crm/developer/usage (таблица ai_usage + счётчики bot_approvals).

import { useMemo } from 'react'
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { Coins, MessagesSquare, TriangleAlert } from 'lucide-react'
import { GlassChartCard } from '@/components/charts/GlassChartCard'
import {
  CHART_GRID_STROKE, CHART_MARGIN, CHART_PALETTE, CHART_TEXT, CHART_TICK, CHART_TOOLTIP_STYLE,
} from '@/components/charts/chart-theme'
import type { ShopBotDiagnostics } from '@/actions/mostovoy-developer'

const TASK_LABELS: Record<string, string> = {
  sales_agent: 'Продавец-консультант',
  hypervisor_context: 'Гипервизор · контекст',
  media_analysis: 'Изображения и аудио',
  laboratory: 'Лаборатория',
  aggressive_learning: 'Агрессивное обучение',
}

const PERIOD_LABELS: [keyof ShopBotDiagnostics['usage']['periods'], string][] = [
  ['today', 'Сегодня'],
  ['averageDay', 'Средний день'],
  ['month', 'За 30 дней'],
  ['year', 'За год'],
  ['all', 'За всё время'],
]

function fmtUsd(value: number) {
  return `$${value.toFixed(value >= 1 ? 2 : 4)}`
}

function fmtTokens(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)} K`
  return String(value)
}

function taskLabel(task: string) {
  return TASK_LABELS[task] ?? task
}

export function ShopBotUsageClient({ data }: { data: ShopBotDiagnostics }) {
  const { status, usage } = data
  const overview = usage.overview

  // Витрина отдаёт разбивку задача × модель — на графике складываем модели,
  // иначе одна задача даёт две одинаковые подписи. Разрез по моделям остаётся
  // в таблице ниже.
  const taskBars = useMemo(() => {
    const byTask = new Map<string, number>()
    for (const item of usage.tasks) {
      byTask.set(item.task, (byTask.get(item.task) ?? 0) + item.costUsd)
    }
    return [...byTask.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([task, cost]) => ({ name: taskLabel(task), Стоимость: Number(cost.toFixed(6)) }))
  }, [usage.tasks])

  // Как менеджеры оценивают черновики: доли считаем от всех решённых, а не от
  // всех сгенерированных — незакрытая очередь не должна портить картину.
  const decided = overview.approved + overview.rejected
  const quality = [
    { label: 'Принято как есть', value: overview.withoutEdits, color: CHART_TEXT.positive },
    { label: 'Принято с правкой', value: Math.max(0, overview.approved - overview.withoutEdits), color: CHART_TEXT.secondary },
    { label: 'Отклонено', value: overview.rejected, color: CHART_TEXT.primary },
  ]
  const qualityMax = Math.max(1, ...quality.map((row) => row.value))

  const tiles: [string, string, string][] = [
    ['Диалогов', overview.conversations.toLocaleString('ru-RU'), 'var(--brand)'],
    ['Сообщений', overview.messages.toLocaleString('ru-RU'), 'var(--brand)'],
    ['Черновиков ИИ', overview.aiReplies.toLocaleString('ru-RU'), 'var(--brand)'],
    ['Отправлено', overview.approved.toLocaleString('ru-RU'), CHART_TEXT.positive],
    ['Без правок', overview.withoutEdits.toLocaleString('ru-RU'), CHART_TEXT.secondary],
    ['Отклонено', overview.rejected.toLocaleString('ru-RU'), CHART_TEXT.primary],
    ['Ждут решения', status.approvals.pending.toLocaleString('ru-RU'), CHART_TEXT.negative],
  ]

  return (
    <div className="flex flex-col gap-4 p-4 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="kicker">Расход ИИ витрины</p>
          <h1 className="block-title span-rule mt-2">Аналитика бота</h1>
          <p className="mt-2 max-w-xl text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
            Сколько токенов и денег съел бот магазина по периодам и по задачам пайплайна,
            и как менеджеры оценивают его черновики.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Pill
            ok={status.enabled}
            label={status.enabled ? `ИИ работает · ${status.settings.model}` : 'ИИ выключен'}
          />
          <Pill ok={status.errors24h === 0} label={`Ошибок за 24 часа: ${status.errors24h}`} />
        </div>
      </header>

      <div
        className="grid gap-2.5"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}
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

      <section className="rounded-2xl p-5" style={{ border: '1px solid var(--line)', background: 'var(--surface)' }}>
        <div className="mb-4 flex items-center gap-2.5">
          <span
            className="grid h-8 w-8 place-items-center rounded-xl"
            style={{ background: 'var(--brand-soft)' }}
            aria-hidden
          >
            <Coins size={15} style={{ color: 'var(--brand-ink)' }} />
          </span>
          <h2 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>
            Расход токенов по периодам
          </h2>
        </div>
        <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          {PERIOD_LABELS.map(([key, label]) => (
            <div key={key} className="rounded-xl px-4 py-3" style={{ background: 'var(--surface-2)' }}>
              <div className="tnum text-base font-bold" style={{ color: 'var(--brand)' }}>
                {fmtTokens(usage.periods[key].tokens)} <span className="text-[11px] font-semibold">tok</span>
              </div>
              <div className="tnum mt-0.5 text-sm font-bold" style={{ color: CHART_TEXT.positive }}>
                {fmtUsd(usage.periods[key].costUsd)}
              </div>
              <div className="mt-1 text-[11px]" style={{ color: 'var(--ink-3)' }}>
                {label}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px]" style={{ color: 'var(--ink-3)' }}>
          Стоимость считается по тарифу DeepSeek: {fmtUsd(usage.pricing.inputUsdPerMillion)} за 1M
          входных и {fmtUsd(usage.pricing.outputUsdPerMillion)} за 1M выходных токенов. Для остальных
          моделей витрина копит только токены.
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassChartCard title="Расход по задачам ИИ, $">
          {taskBars.length === 0 ? (
            <EmptyBlock text="Вызовов ИИ ещё не было — первый реальный ответ бота появится здесь автоматически." />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(180, taskBars.length * 52)}>
              <BarChart data={taskBars} layout="vertical" margin={CHART_MARGIN}>
                <CartesianGrid horizontal={false} stroke={CHART_GRID_STROKE} />
                <XAxis type="number" tick={CHART_TICK} tickLine={false} axisLine={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={150}
                  tick={CHART_TICK}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: 'rgba(225,29,29,0.06)' }} />
                <Bar dataKey="Стоимость" radius={[0, 6, 6, 0]} barSize={18}>
                  {taskBars.map((entry, index) => (
                    <Cell key={entry.name} fill={CHART_PALETTE[index % CHART_PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </GlassChartCard>

        <GlassChartCard title="Качество черновиков">
          {decided === 0 ? (
            <EmptyBlock text="Менеджеры ещё не приняли и не отклонили ни одного черновика." />
          ) : (
            <div className="flex flex-col gap-3.5">
              {quality.map((row) => (
                <div key={row.label}>
                  <div className="mb-1.5 flex justify-between text-[11.5px]">
                    <span style={{ color: 'var(--ink)' }}>{row.label}</span>
                    <span className="tnum" style={{ color: 'var(--ink-3)' }}>
                      {row.value} · {decided === 0 ? 0 : Math.round((row.value / decided) * 100)}%
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full" style={{ background: 'var(--surface-2)' }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(row.value / qualityMax) * 100}%`, background: row.color }}
                    />
                  </div>
                </div>
              ))}
              <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>
                Доли считаются от {decided.toLocaleString('ru-RU')} решённых черновиков; ещё
                {' '}
                {status.approvals.pending.toLocaleString('ru-RU')} ждут решения.
              </p>
            </div>
          )}
        </GlassChartCard>
      </div>

      <section className="rounded-2xl p-5" style={{ border: '1px solid var(--line)', background: 'var(--surface)' }}>
        <div className="mb-4 flex items-center gap-2.5">
          <span
            className="grid h-8 w-8 place-items-center rounded-xl"
            style={{ background: 'var(--brand-soft)' }}
            aria-hidden
          >
            <MessagesSquare size={15} style={{ color: 'var(--brand-ink)' }} />
          </span>
          <h2 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>
            Пайплайн магазина: задачи и модели
          </h2>
        </div>
        {usage.tasks.length === 0 ? (
          <EmptyBlock text="Расходов пока нет." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--ink-3)' }}>
                  <th className="py-2 pr-3 text-left font-bold">Задача</th>
                  <th className="px-3 py-2 text-left font-bold">Модель</th>
                  <th className="px-3 py-2 text-right font-bold">Вызовов</th>
                  <th className="px-3 py-2 text-right font-bold">Токенов</th>
                  <th className="py-2 pl-3 text-right font-bold">Стоимость</th>
                </tr>
              </thead>
              <tbody>
                {usage.tasks.map((item) => (
                  <tr key={`${item.task}-${item.model}`} style={{ borderTop: '1px solid var(--line)' }}>
                    <td className="py-2.5 pr-3 font-semibold" style={{ color: 'var(--ink)' }}>
                      {taskLabel(item.task)}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px]" style={{ color: 'var(--ink-3)' }}>
                      {item.model}
                    </td>
                    <td className="tnum px-3 py-2.5 text-right" style={{ color: 'var(--ink-2)' }}>
                      {item.calls.toLocaleString('ru-RU')}
                    </td>
                    <td className="tnum px-3 py-2.5 text-right" style={{ color: 'var(--ink)' }}>
                      {item.tokens.toLocaleString('ru-RU')}
                    </td>
                    <td className="tnum py-2.5 pl-3 text-right font-bold" style={{ color: CHART_TEXT.positive }}>
                      {fmtUsd(item.costUsd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--ink-3)' }}>
        <TriangleAlert size={12} aria-hidden />
        Данные читаются с витрины «МОСТОВОЙ» при открытии страницы — обновите её, чтобы пересчитать.
      </p>
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
      className="rounded-xl px-4 py-8 text-center text-[12px]"
      style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}
    >
      {text}
    </div>
  )
}

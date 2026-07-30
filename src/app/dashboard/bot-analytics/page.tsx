'use client'

import { useEffect, useState } from 'react'
import { botGet } from '@/lib/bot-api'

type Analytics = {
  hourly: { hour: number; count: number }[]
  daily: { date: string; count: number }[]
  top_problems: { problem: string; count: number }[]
  usage_by_purpose: {
    purpose: string; prompt_tokens: number; completion_tokens: number
    total_tokens: number; total_cost: number; calls: number
  }[]
  stats: {
    total_leads: number; total_messages: number; total_approvals: number
    approved: number; approved_as_is: number; rejected: number
    consultation_confirmed: number
    prompt_tokens: number; completion_tokens: number; total_tokens: number; total_cost: number
  }
}

type TokenStat = { tokens: number; cost: number }
type TokenStats = { today: TokenStat; avg_day: TokenStat; avg_month: TokenStat; year: TokenStat; all_time: TokenStat }

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white p-5">
      <h2 className="font-semibold text-sm mb-4" style={{ color: '#1b1517' }}>{title}</h2>
      {children}
    </div>
  )
}

export default function BotAnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null)
  const [tokens, setTokens] = useState<TokenStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.allSettled([
      botGet<Analytics>('/admin/analytics'),
      botGet<TokenStats>('/admin/analytics/tokens'),
    ]).then(([a, t]) => {
      if (a.status === 'fulfilled') setData(a.value)
      if (t.status === 'fulfilled') setTokens(t.value)
      setLoading(false)
    })
  }, [])

  if (loading) return <p className="p-8 text-sm" style={{ color: '#6b6063' }}>Загрузка аналитики...</p>
  if (!data) return <p className="p-8 text-sm" style={{ color: '#6b6063' }}>Нет данных (бот-бэкенд недоступен)</p>

  const statCards = [
    { label: 'Лидов', value: data.stats.total_leads, color: '#c01818' },
    { label: 'Сообщений', value: data.stats.total_messages, color: '#e11d1d' },
    { label: 'AI ответов', value: data.stats.total_approvals, color: '#047857' },
    { label: 'Принято', value: data.stats.approved, color: '#b45309' },
    { label: 'Без правок', value: data.stats.approved_as_is, color: '#b5491f' },
    { label: 'Отклонено', value: data.stats.rejected, color: '#c01818' },
    { label: 'Записей', value: data.stats.consultation_confirmed, color: '#c01818' },
  ]

  const tokenCards = tokens ? [
    { label: 'Сегодня', s: tokens.today, color: '#c01818' },
    { label: 'Средний в день', s: tokens.avg_day, color: '#c01818' },
    { label: 'За месяц (30 дн.)', s: tokens.avg_month, color: '#e11d1d' },
    { label: 'За год', s: tokens.year, color: '#b45309' },
    { label: 'За всё время', s: tokens.all_time, color: '#047857' },
  ] : []

  const maxProblem = Math.max(...data.top_problems.map(p => p.count), 1)
  const maxHour = Math.max(...data.hourly.map(h => h.count), 1)

  return (
    <div className="p-4 md:p-8 flex flex-col gap-5">
      {/* Основные метрики */}
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
        {statCards.map(s => (
          <div key={s.label} className="rounded-2xl bg-white px-4 py-3.5">
            <div className="text-xl font-bold" style={{ color: s.color }}>{s.value.toLocaleString('ru-RU')}</div>
            <div className="text-xs mt-0.5" style={{ color: '#6b6063' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Токены по периодам */}
      {tokens && (
        <Card title="Расход токенов по периодам">
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            {tokenCards.map(t => (
              <div key={t.label} className="rounded-xl px-4 py-3" style={{ backgroundColor: '#fdfbfb' }}>
                <div className="text-base font-bold" style={{ color: t.color }}>
                  {t.s.tokens.toLocaleString('ru-RU')} <span className="text-xs font-medium">tok</span>
                </div>
                <div className="text-sm font-semibold" style={{ color: '#1b1517' }}>
                  ${t.s.cost.toFixed(t.s.cost >= 1 ? 2 : 4)}
                </div>
                <div className="text-xs mt-1" style={{ color: '#6b6063' }}>{t.label}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        {/* Активность по часам */}
        <Card title="Активность клиентов по часам">
          <div className="flex items-end gap-0.5" style={{ height: 120 }}>
            {data.hourly.map(h => (
              <div key={h.hour} className="flex-1 flex flex-col items-center justify-end h-full" title={`${h.hour}:00 — ${h.count} сообщ.`}>
                <div className="w-full rounded-t" style={{
                  height: `${Math.max((h.count / maxHour) * 100, 2)}%`,
                  backgroundColor: '#e11d1d', opacity: h.count > 0 ? 1 : 0.15,
                }} />
                {h.hour % 6 === 0 && <span className="text-[9px] mt-1" style={{ color: '#7d7174' }}>{h.hour}</span>}
              </div>
            ))}
          </div>
        </Card>

        {/* Топ проблем */}
        <Card title="Проблемы клиентов">
          {data.top_problems.length === 0 && <p className="text-sm" style={{ color: '#6b6063' }}>Нет данных</p>}
          <div className="flex flex-col gap-2.5">
            {data.top_problems.slice(0, 8).map(p => (
              <div key={p.problem}>
                <div className="flex justify-between text-xs mb-1">
                  <span style={{ color: '#1b1517' }}>{p.problem}</span>
                  <span style={{ color: '#6b6063' }}>{p.count}</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: '#fdfbfb' }}>
                  <div className="h-full rounded-full" style={{ width: `${(p.count / maxProblem) * 100}%`, backgroundColor: '#e11d1d' }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Расход по задачам */}
      <Card title="Расход токенов по задачам ИИ">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr className="text-xs uppercase" style={{ color: '#6b6063' }}>
                <th className="text-left py-2 pr-3 font-medium">Задача</th>
                <th className="text-right py-2 px-3 font-medium">Вызовов</th>
                <th className="text-right py-2 px-3 font-medium">Токенов</th>
                <th className="text-right py-2 pl-3 font-medium">Стоимость</th>
              </tr>
            </thead>
            <tbody>
              {data.usage_by_purpose.map(u => (
                <tr key={u.purpose} style={{ borderTop: '1px solid #fdfbfb' }}>
                  <td className="py-2 pr-3" style={{ color: '#1b1517' }}>{u.purpose}</td>
                  <td className="py-2 px-3 text-right" style={{ color: '#6b6063' }}>{u.calls.toLocaleString('ru-RU')}</td>
                  <td className="py-2 px-3 text-right" style={{ color: '#1b1517' }}>{u.total_tokens.toLocaleString('ru-RU')}</td>
                  <td className="py-2 pl-3 text-right font-medium" style={{ color: '#047857' }}>${u.total_cost.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

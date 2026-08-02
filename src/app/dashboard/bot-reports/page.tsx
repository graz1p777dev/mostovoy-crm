'use client'

import { useEffect, useState } from 'react'
import { botGet, botJson } from '@/lib/bot-api'
import { getShopBotSettings } from '@/actions/mostovoy-bot-settings'
import { MetricIconBadge } from '@/components/common/MetricIconBadge'
import GlowOrb from '@/components/common/GlowOrb'

type DayRow = { day: string; new: number; approved: number; rejected: number; saved: number }
type FunnelRow = { stage: string; count: number; pct: number }
type ManagerRow = { manager_id: string; approved: number; rejected: number; edited: number; saved: number }
type BlacklistEntry = { id: number; phone: string; reason: string | null; created_at: string }

function Card({
  title,
  icon,
  children,
}: {
  title: string
  icon: React.ComponentProps<typeof MetricIconBadge>['variant']
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl bg-white p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <MetricIconBadge name={title} variant={icon} />
        <h2 className="font-semibold text-sm" style={{ color: '#1b1517' }}>{title}</h2>
      </div>
      {children}
    </div>
  )
}

const inputCls = 'rounded-xl px-3 py-2 text-sm outline-none'
const inputStyle = { backgroundColor: '#fdfbfb', color: '#1b1517' } as const

export default function BotReportsPage() {
  const [daily, setDaily] = useState<DayRow[]>([])
  const [funnel, setFunnel] = useState<FunnelRow[]>([])
  const [managers, setManagers] = useState<ManagerRow[]>([])
  const [blacklist, setBlacklist] = useState<BlacklistEntry[]>([])
  const [stopWords, setStopWords] = useState<string[]>([])
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [newPhone, setNewPhone] = useState('')
  const [newReason, setNewReason] = useState('')
  const [newWord, setNewWord] = useState('')
  const [loading, setLoading] = useState(true)
  const [approvalEnabled, setApprovalEnabled] = useState(true)

  const load = async () => {
    const [d, f, m, bl, sw, settings] = await Promise.allSettled([
      botGet<DayRow[]>('/admin/reports/daily?days=365'),
      botGet<FunnelRow[]>('/admin/analytics/funnel'),
      botGet<ManagerRow[]>('/admin/analytics/managers'),
      botGet<BlacklistEntry[]>('/admin/blacklist'),
      botGet<{ words: string[] }>('/admin/stop-words'),
      getShopBotSettings(),
    ])
    if (d.status === 'fulfilled') {
      setDaily(d.value)
      setSelectedDay(current => d.value.some(row => row.day === current) ? current : (d.value[0]?.day ?? null))
    }
    if (f.status === 'fulfilled') setFunnel(f.value)
    if (m.status === 'fulfilled') setManagers(m.value)
    if (bl.status === 'fulfilled') setBlacklist(bl.value)
    if (sw.status === 'fulfilled') setStopWords(sw.value.words)
    if (settings.status === 'fulfilled' && settings.value.ok) setApprovalEnabled(settings.value.data.approvalEnabled)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const addBlacklist = async () => {
    if (!newPhone.trim()) return
    await botJson('/admin/blacklist', 'POST', { phone: newPhone.trim(), reason: newReason.trim() || null })
    setNewPhone(''); setNewReason(''); load()
  }
  const removeBlacklist = async (id: number) => { await botJson(`/admin/blacklist/${id}`, 'DELETE'); load() }
  const addStopWord = async () => {
    if (!newWord.trim()) return
    await botJson('/admin/stop-words', 'PUT', { words: [...stopWords, newWord.trim().toLowerCase()] })
    setNewWord(''); load()
  }
  const removeStopWord = async (w: string) => {
    await botJson('/admin/stop-words', 'PUT', { words: stopWords.filter(x => x !== w) }); load()
  }

  if (loading) return (
    <div className="flex flex-col items-center justify-center gap-4 p-8" style={{ minHeight: '60vh' }}>
      <GlowOrb size={72} label="Загрузка отчётов" />
      <p className="text-sm" style={{ color: '#6b6063' }}>Загрузка отчётов...</p>
    </div>
  )

  const totals = {
    new: daily.reduce((s, r) => s + r.new, 0),
    approved: daily.reduce((s, r) => s + r.approved, 0),
    rejected: daily.reduce((s, r) => s + r.rejected, 0),
  }
  const selectedSummary = daily.find(row => row.day === selectedDay) ?? null

  return (
    <div className="p-4 md:p-8 flex flex-col gap-5">
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
        {[
          { label: 'Новых за год', value: totals.new, color: '#c01818' },
          { label: 'Принято', value: totals.approved, color: '#15803d' },
          { label: 'Отклонено', value: totals.rejected, color: '#c01818' },
          { label: 'В чёрном списке', value: blacklist.length, color: '#b45309' },
          { label: 'Стоп-слов', value: stopWords.length, color: '#e11d1d' },
        ].map(s => (
          <div key={s.label} className="rounded-2xl bg-white px-4 py-3.5">
            <div className="text-xl font-bold" style={{ color: s.color }}>{s.value}</div>
            <div className="text-xs mt-0.5" style={{ color: '#6b6063' }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(260px,0.8fr)]">
        <Card title="История ежедневных сводок" icon="calendar">
          <p className="mb-3 text-xs" style={{ color: '#6b6063' }}>Все дни с активностью бота за последний год. Нажмите на дату, чтобы открыть её итог.</p>
          <div className="overflow-y-auto" style={{ maxHeight: 360 }}>
            <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
              <thead><tr className="sticky top-0 bg-white text-xs uppercase" style={{ color: '#6b6063' }}><th className="text-left py-2 pr-3 font-medium">Дата</th><th className="text-right py-2 px-3 font-medium">Новых</th><th className="text-right py-2 px-3 font-medium">Принято</th><th className="text-right py-2 px-3 font-medium">Отклонено</th><th className="text-right py-2 pl-3 font-medium">Сохранено</th></tr></thead>
              <tbody>{daily.map(row => <tr key={row.day} onClick={() => setSelectedDay(row.day)} className="cursor-pointer transition-colors" style={{ borderTop: '1px solid #fdfbfb', backgroundColor: selectedDay === row.day ? '#faf8f7' : undefined }}><td className="py-2 pr-3 font-medium" style={{ color: '#1b1517' }}>{new Date(`${row.day}T00:00:00`).toLocaleDateString('ru-RU')}</td><td className="py-2 px-3 text-right font-semibold" style={{ color: '#c01818' }}>{row.new}</td><td className="py-2 px-3 text-right" style={{ color: '#15803d' }}>{row.approved}</td><td className="py-2 px-3 text-right" style={{ color: '#c01818' }}>{row.rejected}</td><td className="py-2 pl-3 text-right" style={{ color: '#6b6063' }}>{row.saved}</td></tr>)}{daily.length === 0 && <tr><td colSpan={5} className="py-5 text-center" style={{ color: '#6b6063' }}>За этот период нет активности</td></tr>}</tbody>
            </table>
          </div>
        </Card>
        <Card title="Сводка за день" icon="calendar">
          {selectedSummary ? <><p className="mb-4 text-sm font-semibold" style={{ color: '#1b1517' }}>{new Date(`${selectedSummary.day}T00:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</p><div className="grid grid-cols-2 gap-2"><div className="rounded-xl p-3" style={{ backgroundColor: '#fdfbfb' }}><p className="text-xs text-[#c01818]">Новых</p><b className="text-xl text-[#c01818]">{selectedSummary.new}</b></div><div className="rounded-xl p-3" style={{ backgroundColor: '#f0fdf4' }}><p className="text-xs text-[#16a34a]">Принято</p><b className="text-xl text-[#15803d]">{selectedSummary.approved}</b></div><div className="rounded-xl p-3" style={{ backgroundColor: '#fef2f2' }}><p className="text-xs text-[#c01818]">Отклонено</p><b className="text-xl text-[#c01818]">{selectedSummary.rejected}</b></div><div className="rounded-xl p-3" style={{ backgroundColor: '#fdfbfb' }}><p className="text-xs text-[#6b6063]">Сохранено</p><b className="text-xl text-[#3a3032]">{selectedSummary.saved}</b></div></div></> : <p className="text-sm" style={{ color: '#6b6063' }}>Выберите дату из истории.</p>}
        </Card>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Card title="Воронка по этапам" icon="funnel">
          {funnel.length === 0 && <p className="text-sm" style={{ color: '#6b6063' }}>Нет данных</p>}
          <div className="flex flex-col gap-2.5">
            {funnel.map(r => (
              <div key={r.stage}>
                <div className="flex justify-between text-xs mb-1">
                  <span style={{ color: '#1b1517' }}>{r.stage}</span>
                  <span style={{ color: '#6b6063' }}>{r.count} · {r.pct}%</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: '#fdfbfb' }}>
                  <div className="h-full rounded-full" style={{ width: `${r.pct}%`, backgroundColor: '#e11d1d' }} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        {approvalEnabled && <Card title="Активность менеджеров" icon="people">
          <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr className="text-xs uppercase" style={{ color: '#6b6063' }}>
                <th className="text-left py-2 pr-2 font-medium">Менеджер</th>
                <th className="text-right py-2 px-2 font-medium">Принял</th>
                <th className="text-right py-2 px-2 font-medium">Откл.</th>
                <th className="text-right py-2 px-2 font-medium">Изменил</th>
                <th className="text-right py-2 pl-2 font-medium">Сохр.</th>
              </tr>
            </thead>
            <tbody>
              {managers.map(r => (
                <tr key={r.manager_id} style={{ borderTop: '1px solid #fdfbfb' }}>
                  <td className="py-2 pr-2 font-medium" style={{ color: '#1b1517' }}>{r.manager_id}</td>
                  <td className="py-2 px-2 text-right" style={{ color: '#15803d' }}>{r.approved}</td>
                  <td className="py-2 px-2 text-right" style={{ color: '#c01818' }}>{r.rejected}</td>
                  <td className="py-2 px-2 text-right" style={{ color: '#1b1517' }}>{r.edited}</td>
                  <td className="py-2 pl-2 text-right" style={{ color: '#6b6063' }}>{r.saved}</td>
                </tr>
              ))}
              {managers.length === 0 && <tr><td colSpan={5} className="py-4 text-center" style={{ color: '#6b6063' }}>Нет данных</td></tr>}
            </tbody>
          </table>
        </Card>}
      </div>

      <Card title="Стоп-слова" icon="ban">
        <div className="flex flex-wrap gap-2 mb-4">
          {stopWords.map(w => (
            <span key={w} className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs"
                  style={{ backgroundColor: '#fdfbfb', color: '#1b1517' }}>
              {w}
              <button onClick={() => removeStopWord(w)} className="text-sm leading-none" style={{ color: '#c01818' }}>×</button>
            </span>
          ))}
          {stopWords.length === 0 && <span className="text-sm" style={{ color: '#6b6063' }}>Нет стоп-слов</span>}
        </div>
        <div className="flex gap-2">
          <input value={newWord} onChange={e => setNewWord(e.target.value)}
                 onKeyDown={e => e.key === 'Enter' && addStopWord()}
                 placeholder="Добавить слово..." className={inputCls} style={{ ...inputStyle, maxWidth: 240, flex: 1 }} />
          <button onClick={addStopWord} className="rounded-xl px-4 py-2 text-sm font-medium text-white"
                  style={{ backgroundColor: '#e11d1d' }}>Добавить</button>
        </div>
        <p className="text-xs mt-3" style={{ color: '#6b6063' }}>
          При совпадении слова в сообщении клиента — карточка отправляется с пометкой «стоп-слово» без AI-ответа.
        </p>
      </Card>

      <Card title="Чёрный список" icon="ban">
        <div className="flex flex-wrap gap-2 mb-4">
          <input value={newPhone} onChange={e => setNewPhone(e.target.value)}
                 placeholder="+996 700 000 000" className={inputCls} style={{ ...inputStyle, minWidth: 180 }} />
          <input value={newReason} onChange={e => setNewReason(e.target.value)}
                 placeholder="Причина (необязательно)" className={inputCls} style={{ ...inputStyle, flex: 1, minWidth: 180 }} />
          <button onClick={addBlacklist} className="rounded-xl px-4 py-2 text-sm font-medium text-white"
                  style={{ backgroundColor: '#e11d1d' }}>Добавить</button>
        </div>
        {blacklist.length === 0 ? (
          <p className="text-sm" style={{ color: '#6b6063' }}>Чёрный список пуст</p>
        ) : (
          <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr className="text-xs uppercase" style={{ color: '#6b6063' }}>
                <th className="text-left py-2 pr-3 font-medium">Телефон</th>
                <th className="text-left py-2 px-3 font-medium">Причина</th>
                <th className="text-left py-2 px-3 font-medium">Добавлен</th>
                <th className="py-2 pl-3" />
              </tr>
            </thead>
            <tbody>
              {blacklist.map(e => (
                <tr key={e.id} style={{ borderTop: '1px solid #fdfbfb' }}>
                  <td className="py-2 pr-3 font-mono text-xs" style={{ color: '#1b1517' }}>{e.phone}</td>
                  <td className="py-2 px-3" style={{ color: '#6b6063' }}>{e.reason || '—'}</td>
                  <td className="py-2 px-3 text-xs" style={{ color: '#7d7174' }}>{e.created_at}</td>
                  <td className="py-2 pl-3 text-right">
                    <button onClick={() => removeBlacklist(e.id)} className="text-xs" style={{ color: '#c01818' }}>Удалить</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}

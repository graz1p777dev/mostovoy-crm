'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BarChart3, CalendarDays, ChevronLeft, ChevronRight, CircleDollarSign, Megaphone, ShoppingBag, Users } from 'lucide-react'

type DayAnalytics = {
  date: string
  fv: number
  sales: number
  revenue: number
  leads: number
  appeals: number
  adBudget: number
  activeCampaigns: number
  income: number
  expense: number
  events: number
  dailyPlan: number
}

type Props = { month: string; days: DayAnalytics[] }

const money = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 })
const weekday = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

function monthLabel(month: string) {
  return new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' })
    .format(new Date(`${month}-01T12:00:00`))
}

function insight(day: DayAnalytics) {
  if (!day.events) return 'За этот день событий в CRM не зафиксировано.'
  if (day.dailyPlan > 0 && day.revenue >= day.dailyPlan) return 'Дневная цель по выручке выполнена.'
  if (day.sales > 0 && day.revenue > 0) return `Есть ${day.sales} ${day.sales === 1 ? 'продажа' : 'продажи'} на ${money.format(day.revenue)} сом.`
  if (day.adBudget > 0) return `На рекламу потрачено ${money.format(day.adBudget)} сом; продаж за день не зафиксировано.`
  if (day.fv > 0) return `Проведено ФВ: ${day.fv}. Продажи ещё не внесены.`
  return 'Есть операционные события, но выручка за день не внесена.'
}

export default function CalendarAnalytics({ month, days }: Props) {
  const router = useRouter()
  const [selected, setSelected] = useState(days.find((day) => day.date === new Date().toISOString().slice(0, 10)) ?? days[0])
  useEffect(() => {
    setSelected(days.find((day) => day.date === new Date().toISOString().slice(0, 10)) ?? days[0])
  }, [days])
  const maxRevenue = Math.max(...days.map((day) => day.revenue), 1)
  const firstWeekday = (new Date(`${month}-01T12:00:00`).getDay() + 6) % 7
  const blanks = Array.from({ length: firstWeekday })
  const totals = useMemo(() => days.reduce((sum, day) => ({
    revenue: sum.revenue + day.revenue,
    sales: sum.sales + day.sales,
    fv: sum.fv + day.fv,
    budget: sum.budget + day.adBudget,
  }), { revenue: 0, sales: 0, fv: 0, budget: 0 }), [days])

  function changeMonth(offset: number) {
    const current = new Date(`${month}-01T12:00:00`)
    current.setMonth(current.getMonth() + offset)
    const next = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`
    router.push(`/dashboard/calendar?month=${next}`)
  }

  return (
    <div className="p-4 md:p-8" style={{ maxWidth: 1440 }}>
      <div className="flex flex-col gap-5">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--ink-25)' }}>Дневник бизнеса</p>
            <h1 className="mt-1 text-2xl font-bold" style={{ color: 'var(--ink)' }}>Календарь с аналитикой</h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--ink-25)' }}>Круг дня показывает выручку; откройте день, чтобы понять, что реально произошло.</p>
          </div>
          <div className="flex items-center gap-2 self-start rounded-xl bg-white p-1.5" style={{ border: '1px solid var(--surface-3)' }}>
            <button aria-label="Предыдущий месяц" onClick={() => changeMonth(-1)} className="rounded-lg p-2 hover:bg-[var(--paper)]"><ChevronLeft size={18} /></button>
            <span className="min-w-40 text-center text-sm font-semibold capitalize" style={{ color: 'var(--ink)' }}>{monthLabel(month)}</span>
            <button aria-label="Следующий месяц" onClick={() => changeMonth(1)} className="rounded-lg p-2 hover:bg-[var(--paper)]"><ChevronRight size={18} /></button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Выручка месяца', value: `${money.format(totals.revenue)} сом`, icon: CircleDollarSign, color: 'var(--brand)' },
            { label: 'Продажи', value: String(totals.sales), icon: ShoppingBag, color: 'var(--ok)' },
            { label: 'ФВ', value: String(totals.fv), icon: Users, color: 'var(--brand)' },
            { label: 'Бюджет рекламы', value: `${money.format(totals.budget)} сом`, icon: Megaphone, color: 'var(--orange-ink)' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="rounded-2xl bg-white p-4" style={{ border: '1px solid var(--surface-3)' }}>
              <Icon size={18} color={color} />
              <p className="mt-3 text-xl font-bold" style={{ color: 'var(--ink)' }}>{value}</p>
              <p className="mt-1 text-xs" style={{ color: 'var(--ink-25)' }}>{label}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="rounded-2xl bg-white p-4 md:p-6" style={{ border: '1px solid var(--surface-3)' }}>
            <div className="mb-5 flex items-center justify-between gap-4">
              <div><h2 className="font-bold" style={{ color: 'var(--ink)' }}>Карта месяца</h2><p className="mt-1 text-xs" style={{ color: 'var(--ink-25)' }}>Чем насыщеннее круг, тем больше выручка в этот день.</p></div>
              <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--ink-25)' }}><span className="size-3 rounded-full" style={{ background: 'var(--paper-2)', border: '1px solid var(--line)' }} /><span className="size-3 rounded-full" style={{ background: 'rgba(225,29,29,0.45)' }} /><span className="size-3 rounded-full" style={{ background: 'var(--brand)' }} /></div>
            </div>
            <div className="grid grid-cols-7 gap-y-3 text-center text-xs" style={{ color: 'var(--ink-25)' }}>{weekday.map((day) => <span key={day}>{day}</span>)}</div>
            <div className="mt-3 grid grid-cols-7 gap-y-3">
              {blanks.map((_, index) => <div key={`blank-${index}`} />)}
              {days.map((day) => {
                const intensity = day.revenue > 0 ? Math.max(0.22, day.revenue / maxRevenue) : 0
                const isSelected = selected.date === day.date
                const isToday = day.date === new Date().toISOString().slice(0, 10)
                const bg = day.revenue > 0 ? `rgba(225, 29, 29, ${0.16 + intensity * 0.84})` : 'var(--paper-2)'
                const fg = intensity > 0.55 ? 'var(--surface)' : 'var(--ink)'
                return <button key={day.date} aria-label={`${day.date}: ${money.format(day.revenue)} сом`} onClick={() => setSelected(day)} className="group relative mx-auto flex size-11 items-center justify-center rounded-full text-sm font-bold transition-transform hover:scale-105 focus:outline-none" style={{ background: bg, color: fg, outline: isSelected ? '3px solid var(--brand)' : isToday ? '2px solid var(--brand)' : 'none', outlineOffset: 2 }} title={`${day.date}: ${money.format(day.revenue)} сом`}>
                  {Number(day.date.slice(-2))}
                  {day.events > 0 && <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full" style={{ background: 'var(--warn-base)', border: '1px solid white' }} />}
                </button>
              })}
            </div>
          </section>

          <aside className="p-5" style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 24 }}>
            <div className="flex items-center gap-2"><CalendarDays size={18} color="var(--brand)" /><p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(new Date(`${selected.date}T12:00:00`))}</p></div>
            <p className="mt-4 text-lg font-semibold leading-snug" style={{ color: 'var(--ink)' }}>{insight(selected)}</p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              {[
                ['Выручка', `${money.format(selected.revenue)} сом`], ['Продажи', String(selected.sales)], ['ФВ', String(selected.fv)], ['Лиды', String(selected.leads)], ['Доходы', `${money.format(selected.income)} сом`], ['Расходы', `${money.format(selected.expense)} сом`],
              ].map(([label, value]) => <div key={label} className="p-3" style={{ background: 'var(--paper)', border: '1px solid var(--surface-3)', borderRadius: 14 }}><p className="text-[11px]" style={{ color: 'var(--ink-25)' }}>{label}</p><p className="mt-1 text-sm font-semibold" style={{ color: 'var(--ink)' }}>{value}</p></div>)}
            </div>
            <div className="mt-4 p-3" style={{ background: 'var(--brand-soft)', border: '1px solid var(--brand-soft-border)', borderRadius: 14 }}><div className="flex items-center gap-2"><BarChart3 size={15} color="var(--brand-ink)" /><span className="text-xs font-semibold" style={{ color: 'var(--brand-ink)' }}>Контекст дня</span></div><p className="mt-2 text-xs leading-relaxed" style={{ color: 'var(--ink-2)' }}>Реклама: {money.format(selected.adBudget)} сом · кампаний: {selected.activeCampaigns} · обращений: {selected.appeals}</p>{selected.dailyPlan > 0 && <p className="mt-1 text-xs" style={{ color: 'var(--ink-2)' }}>Цель на день: {money.format(selected.dailyPlan)} сом</p>}</div>
          </aside>
        </div>
      </div>
    </div>
  )
}

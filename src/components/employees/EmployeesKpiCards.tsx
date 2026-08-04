'use client'

import { Users, UserCheck, TrendingUp, Wallet } from 'lucide-react'
import type { EmployeeStats } from '@/lib/models/employees'
import { fmtMoney } from './employees-utils'

interface Props { stats: EmployeeStats }

interface CardProps {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  accent?: string
}

function Card({ icon, label, value, sub, accent }: CardProps) {
  return (
    <div className="rounded-2xl p-4 flex items-start gap-3" style={{ backgroundColor: 'var(--surface)' }}>
      <div
        className="flex items-center justify-center w-10 h-10 rounded-xl flex-shrink-0"
        style={{ backgroundColor: accent ?? 'var(--brand)' }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-xs font-medium mb-1" style={{ color: 'var(--ink-3)' }}>{label}</div>
        <div className="text-xl font-bold leading-tight" style={{ color: 'var(--ink)' }}>{value}</div>
        {sub && <div className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>{sub}</div>}
      </div>
    </div>
  )
}

export default function EmployeesKpiCards({ stats }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Card
        icon={<Users size={18} color="var(--on-brand)" />}
        label="Всего сотрудников"
        value={String(stats.total)}
        sub={`${stats.archived} в архиве`}
      />
      <Card
        icon={<UserCheck size={18} color="var(--on-brand)" />}
        label="Активных"
        value={String(stats.active)}
        accent="var(--brand)"
      />
      <Card
        icon={<TrendingUp size={18} color="var(--on-brand)" />}
        label="Ср. выполнение KPI"
        value={`${stats.avgKpiPct}%`}
        accent={stats.avgKpiPct >= 100 ? 'var(--ok-strong)' : stats.avgKpiPct >= 80 ? 'var(--warn-strong-2)' : 'var(--brand-ink)'}
      />
      <Card
        icon={<Wallet size={18} color="var(--on-brand)" />}
        label="Суммарный ФОТ"
        value={fmtMoney(stats.totalFund)}
        sub="оклад + бонус"
        accent="var(--brand)"
      />
    </div>
  )
}

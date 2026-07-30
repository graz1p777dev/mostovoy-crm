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
    <div className="rounded-2xl p-4 flex items-start gap-3" style={{ backgroundColor: '#ffffff' }}>
      <div
        className="flex items-center justify-center w-10 h-10 rounded-xl flex-shrink-0"
        style={{ backgroundColor: accent ?? '#e11d1d' }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-xs font-medium mb-1" style={{ color: '#7d7174' }}>{label}</div>
        <div className="text-xl font-bold leading-tight" style={{ color: '#1b1517' }}>{value}</div>
        {sub && <div className="text-xs mt-0.5" style={{ color: '#7d7174' }}>{sub}</div>}
      </div>
    </div>
  )
}

export default function EmployeesKpiCards({ stats }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Card
        icon={<Users size={18} color="#ffffff" />}
        label="Всего сотрудников"
        value={String(stats.total)}
        sub={`${stats.archived} в архиве`}
      />
      <Card
        icon={<UserCheck size={18} color="#ffffff" />}
        label="Активных"
        value={String(stats.active)}
        accent="#e11d1d"
      />
      <Card
        icon={<TrendingUp size={18} color="#ffffff" />}
        label="Ср. выполнение KPI"
        value={`${stats.avgKpiPct}%`}
        accent={stats.avgKpiPct >= 100 ? '#166534' : stats.avgKpiPct >= 80 ? '#854d0e' : '#c01818'}
      />
      <Card
        icon={<Wallet size={18} color="#ffffff" />}
        label="Суммарный ФОТ"
        value={fmtMoney(stats.totalFund)}
        sub="оклад + бонус"
        accent="#e11d1d"
      />
    </div>
  )
}

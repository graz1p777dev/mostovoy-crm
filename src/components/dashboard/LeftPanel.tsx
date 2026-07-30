import { createTokenClient } from '@/lib/supabase/token-client'
import { getRuMonthName } from '@/lib/formatters'
import { getMonthKpiStats, getRevenueByWeeks, getPlanVsFactTable } from '@/lib/dashboard-queries'
import MonthKpiCards from './MonthKpiCards'
import RevenueWeeksChart from './RevenueWeeksChart'
import PlanVsFactTable from './PlanVsFactTable'

interface LeftPanelProps {
  year: number
  month: number
  employeeId?: string
  role: string
  permissionLevel?: string
  accessToken: string
}

export default async function LeftPanel({ year, month, employeeId, role, permissionLevel, accessToken }: LeftPanelProps) {
  // Используем token-клиент вместо createClient() + cookies(),
  // так как cookies() нельзя вызывать внутри Suspense во время стриминга.
  //
  // ВАЖНО: accessToken не должен передаваться в дочерние Client Components,
  // и этот файл не должен получать директиву 'use client' —
  // иначе токен попадёт в JS-бандл и станет виден в браузере.
  const supabase = createTokenClient(accessToken)

  // Используем permissionLevel для фильтрации — поддерживает пользовательские роли.
  // Фолбэк на имя роли для обратной совместимости (если permissionLevel не передан).
  const effectiveLevel = permissionLevel ?? (role === 'mp' || role === 'lmai' ? 'employee' : role === 'rop' ? 'department_head' : 'owner')
  const filterById = effectiveLevel === 'employee' ? employeeId : undefined

  const [stats, weeks, tableRows] = await Promise.all([
    getMonthKpiStats(supabase, year, month, filterById),
    getRevenueByWeeks(supabase, year, month, filterById),
    getPlanVsFactTable(supabase, year, month, filterById),
  ])

  const monthName = getRuMonthName(month)

  return (
    <div className="px-6 pb-6 flex flex-col gap-5">
      {/* KPI карточки */}
      <div>
        <p
          className="mb-3 font-medium"
          style={{ fontSize: 12, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}
        >
          Ключевые показатели
        </p>
        <MonthKpiCards stats={stats} />
      </div>

      {/* График выручки */}
      <div>
        <p
          className="mb-3 font-medium"
          style={{ fontSize: 12, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}
        >
          Выручка по неделям · {monthName}
        </p>
        <RevenueWeeksChart data={weeks} />
      </div>

      {/* Таблица план vs факт */}
      {(role === 'owner' || role === 'rop') && tableRows.length > 0 && (
        <div>
          <p
            className="mb-3 font-medium"
            style={{ fontSize: 12, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}
          >
            План vs Факт · команда
          </p>
          <PlanVsFactTable rows={tableRows} />
        </div>
      )}

      {/* Для МП/LMAI — личные данные вместо таблицы */}
      {(role === 'mp' || role === 'lmai') && (
        <div>
          <p
            className="mb-3 font-medium"
            style={{ fontSize: 12, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}
          >
            Личные показатели · {monthName}
          </p>
          <PlanVsFactTable rows={tableRows} />
        </div>
      )}
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { FinanceHeader, FinanceKpiDashboard, FinanceCharts, FinanceDailyTable } from '@/components/finance'
import { getFinanceData } from '@/lib/services/finance.service'
import type { FinanceData } from '@/lib/models/finance'

export default function FinancePage() {
  const now   = new Date()
  const [year,  setYear]  = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [data,  setData]  = useState<FinanceData | null>(null)

  useEffect(() => {
    let cancelled = false
    getFinanceData(year, month).then(d => { if (!cancelled) setData(d) })
    return () => { cancelled = true }
  }, [year, month])

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--paper-2)' }}>
      <FinanceHeader year={year} month={month} onPrev={prevMonth} onNext={nextMonth} />

      {!data ? (
        <div className="p-5 space-y-4">
          {[80, 240, 240, 440].map((h, i) => (
            <div key={i} className="rounded-2xl animate-pulse" style={{ height: h, backgroundColor: 'var(--paper)' }} />
          ))}
        </div>
      ) : (
        <div className="p-5 space-y-4">
          <FinanceKpiDashboard kpi={data.kpi} />
          <FinanceCharts       daily={data.daily} kpi={data.kpi} />
          <FinanceDailyTable   rows={data.daily}  kpi={data.kpi} />
        </div>
      )}
    </div>
  )
}

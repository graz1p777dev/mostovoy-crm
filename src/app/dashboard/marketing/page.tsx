'use client'

import { useState, useEffect } from 'react'
import {
  MarketingHeader,
  MarketingKpiDashboard,
  MarketingCharts,
  MarketingDailyTable,
} from '@/components/marketing'
import { getMarketingData } from '@/lib/services/marketing.service'
import type { MarketingData } from '@/lib/models/marketing'

export default function MarketingPage() {
  const now   = new Date()
  const [year,  setYear]  = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [data,  setData]  = useState<MarketingData | null>(null)

  useEffect(() => {
    let cancelled = false
    getMarketingData(year, month).then(d => {
      if (!cancelled) setData(d)
    })
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
    <div className="min-h-screen" style={{ backgroundColor: '#fdfbfb' }}>
      <MarketingHeader year={year} month={month} onPrev={prevMonth} onNext={nextMonth} />

      {!data ? (
        <div className="p-5 space-y-4">
          {[80, 220, 220, 400].map((h, i) => (
            <div key={i} className="rounded-2xl animate-pulse" style={{ height: h, backgroundColor: '#faf8f7' }} />
          ))}
        </div>
      ) : (
        <div className="p-5 space-y-4">
          <MarketingKpiDashboard kpi={data.kpi} />
          <MarketingCharts     daily={data.daily} />
          <MarketingDailyTable rows={data.daily} kpi={data.kpi} />
        </div>
      )}
    </div>
  )
}

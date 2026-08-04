'use client'

import { SettingsSubpageHeader } from '@/components/settings/BackToSettings'
import { KpiSettingsPanel } from '@/components/dashboard/KpiSettingsPanel'

export default function KpiSettingsPage() {
  return (
    <div className="flex flex-col gap-4 p-4 md:p-8">
      <SettingsSubpageHeader
        title="KPI и оплата"
        subtitle="Оклады, бонусы, ступени, KPI-пункты по ролям"
      />
      <div className="max-w-3xl">
        <KpiSettingsPanel />
      </div>
    </div>
  )
}

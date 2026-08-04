'use client'

import { SettingsSubpageHeader } from '@/components/settings/BackToSettings'
import { WorkSchedulesPanel } from '@/components/settings/WorkSchedulesPanel'

export default function SchedulesSettingsPage() {
  return (
    <div className="flex flex-col gap-4 p-4 md:p-8">
      <SettingsSubpageHeader
        title="Графики работы"
        subtitle="Справочник рабочих графиков сотрудников"
      />
      <div className="max-w-2xl">
        <WorkSchedulesPanel />
      </div>
    </div>
  )
}

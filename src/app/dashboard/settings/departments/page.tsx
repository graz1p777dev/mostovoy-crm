'use client'

import { SettingsSubpageHeader } from '@/components/settings/BackToSettings'
import { DepartmentsPanel } from '@/components/settings/DepartmentsPanel'

export default function DepartmentsSettingsPage() {
  return (
    <div className="flex flex-col gap-4 p-4 md:p-8">
      <SettingsSubpageHeader
        title="Отделы"
        subtitle="Структура компании, руководители отделов"
      />
      <div className="max-w-2xl">
        <DepartmentsPanel />
      </div>
    </div>
  )
}

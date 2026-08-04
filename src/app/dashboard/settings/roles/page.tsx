'use client'

import { SettingsSubpageHeader } from '@/components/settings/BackToSettings'
import { AccessControlPanel } from '@/components/settings/AccessControlPanel'
import { RolesPanel } from '@/components/settings/RolesPanel'

export default function RolesAndAccessPage() {
  return (
    <div className="flex flex-col gap-4 p-4 md:p-8">
      <SettingsSubpageHeader
        title="Роли и доступы"
        subtitle="Кто что может видеть, создавать, менять и удалять"
      />
      <div className="space-y-5 max-w-3xl">
        <AccessControlPanel />
        <RolesPanel />
      </div>
    </div>
  )
}

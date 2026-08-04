'use client'

import { SlidersHorizontal } from 'lucide-react'
import { SettingsSubpageHeader } from '@/components/settings/BackToSettings'
import { SectionCard } from '@/components/settings/SectionCard'
import { BRAND } from '@/config/brand'

const ENV_LABEL = process.env.NEXT_PUBLIC_ENV_LABEL ?? '—'

export default function GeneralSettingsPage() {
  return (
    <div className="flex flex-col gap-4 p-4 md:p-8">
      <SettingsSubpageHeader
        title="Общее"
        subtitle="Информация о системе и окружении"
      />
      <div className="max-w-xl">
        <SectionCard icon={<SlidersHorizontal size={15} color="var(--on-brand)" />} title="О системе">
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span style={{ color: 'var(--ink-3)' }}>Название</span>
              <span className="font-medium" style={{ color: 'var(--ink)' }}>{BRAND.identity.name} — CRM</span>
            </div>
            <div className="flex items-center justify-between">
              <span style={{ color: 'var(--ink-3)' }}>Окружение</span>
              <span
                className="font-medium px-2 py-0.5 rounded-md text-xs"
                style={{
                  color: ENV_LABEL === 'PRODUCTION' ? 'var(--brand-ink)' : 'var(--info)',
                  backgroundColor: ENV_LABEL === 'PRODUCTION' ? 'var(--brand-soft)' : 'var(--info-soft)',
                }}
              >
                {ENV_LABEL}
              </span>
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  )
}

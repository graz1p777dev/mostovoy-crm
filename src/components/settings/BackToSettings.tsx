'use client'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export function SettingsSubpageHeader({ title, subtitle }: {
  title: string
  subtitle: string
}) {
  return (
    <header>
      <Link
        href="/dashboard/settings"
        className="inline-flex items-center gap-1.5 text-xs mb-3 transition-colors"
        style={{ color: 'var(--ink-3)' }}
      >
        <ArrowLeft style={{ width: 14, height: 14 }} />
        Назад к настройкам
      </Link>
      <p className="kicker">Настройки</p>
      <h1 className="block-title span-rule mt-2">{title}</h1>
      <p className="mt-2 max-w-xl text-[12.5px]" style={{ color: 'var(--ink-3)' }}>{subtitle}</p>
    </header>
  )
}

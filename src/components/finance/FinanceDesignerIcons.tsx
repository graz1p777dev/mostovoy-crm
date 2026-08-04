import { forwardRef } from 'react'
import type { LucideProps } from 'lucide-react'

type MetricIconKey =
  | 'revenue'
  | 'expenses'
  | 'profit'
  | 'margin'
  | 'deals'
  | 'avgCheck'
  | 'payroll'
  | 'marketing'
  | 'rent'
  | 'supplies'
  | 'other'

interface MetricIconProps {
  icon: MetricIconKey
}

// Те же четыре тона, что у MetricIconBadge: красный — деньги и главные
// показатели, рыжий — затраты, зелёный — прибыль, графит — служебное.
// Плоская заливка вместо градиентов «зелёный→красный»: плашка помечает
// метрику, а не спорит с числом.
type IconTone = { bg: string; fg: string; accent: string }

const TONE_BRAND: IconTone = { bg: 'var(--brand)', fg: 'var(--surface)', accent: 'rgba(255,255,255,0.60)' }
const TONE_COST: IconTone = { bg: 'var(--series-negative)', fg: 'var(--surface)', accent: 'rgba(255,255,255,0.60)' }
const TONE_GOOD: IconTone = { bg: 'var(--series-positive)', fg: 'var(--surface)', accent: 'rgba(255,255,255,0.60)' }
const TONE_MUTED: IconTone = { bg: 'var(--ink-2)', fg: 'var(--surface)', accent: 'rgba(255,255,255,0.56)' }

const ICON_TONES: Record<MetricIconKey, IconTone> = {
  revenue: TONE_BRAND,
  margin: TONE_BRAND,
  deals: TONE_BRAND,
  avgCheck: TONE_BRAND,
  profit: TONE_GOOD,
  expenses: TONE_COST,
  marketing: TONE_COST,
  rent: TONE_COST,
  supplies: TONE_COST,
  payroll: TONE_MUTED,
  other: TONE_MUTED,
}

function MetricGlyph({ icon, color, accent }: { icon: MetricIconKey; color: string; accent: string }) {
  switch (icon) {
    case 'revenue':
      return (
        <>
          <path d="M8 17.5h8" stroke={color} strokeWidth="1.9" strokeLinecap="round" />
          <path d="M12 17.5V7" stroke={color} strokeWidth="1.9" strokeLinecap="round" />
          <path d="M8.5 10.2c0-1.9 1.55-3.2 3.7-3.2 1.4 0 2.45.38 3.2 1" stroke={accent} strokeWidth="1.9" strokeLinecap="round" />
          <path d="M15.5 13.8c0 1.9-1.55 3.2-3.7 3.2-1.55 0-2.7-.45-3.55-1.18" stroke={accent} strokeWidth="1.9" strokeLinecap="round" />
        </>
      )
    case 'expenses':
      return (
        <>
          <path d="M7 8.5h10M7 12h7.5M7 15.5h5" stroke={color} strokeWidth="1.9" strokeLinecap="round" />
          <path d="M15 14.2l2.4 2.4m0 0 2.4-2.4m-2.4 2.4V9.8" stroke={accent} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )
    case 'profit':
      return (
        <>
          <path d="M5.5 16.5 10 12l3 3 5.5-6" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M15 8.5h3.5V12" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )
    case 'margin':
      return (
        <>
          <path d="M7 17 17 7" stroke={color} strokeWidth="2" strokeLinecap="round" />
          <circle cx="8.5" cy="8.5" r="2" stroke={accent} strokeWidth="1.8" />
          <circle cx="15.5" cy="15.5" r="2" stroke={accent} strokeWidth="1.8" />
        </>
      )
    case 'deals':
      return (
        <>
          <path d="M7.2 13.2 10 16a2 2 0 0 0 2.8 0l4-4" stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M5.7 11.7 8.4 9a2 2 0 0 1 2.8 0l.8.8.8-.8a2 2 0 0 1 2.8 0l2.7 2.7" stroke={accent} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )
    case 'avgCheck':
      return (
        <>
          <path d="M7.5 5.8h9v12.4l-1.6-.9-1.45.9-1.45-.9-1.45.9-1.45-.9-1.6.9V5.8Z" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M10 9h4M10 12h4M10 15h2.5" stroke={accent} strokeWidth="1.7" strokeLinecap="round" />
        </>
      )
    case 'payroll':
      return (
        <>
          <circle cx="9" cy="9" r="2.3" stroke={accent} strokeWidth="1.8" />
          <circle cx="15.2" cy="9.7" r="1.8" stroke={color} strokeWidth="1.7" />
          <path d="M5.8 17.2c.6-2.2 1.9-3.3 3.4-3.3s2.8 1.1 3.4 3.3M13 17.2c.4-1.55 1.25-2.35 2.35-2.35 1.15 0 2 .8 2.5 2.35" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
        </>
      )
    case 'marketing':
      return (
        <>
          <path d="M6.5 13h3.3l7-4.2v8.4l-7-4.2" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M8.8 13.1 10 18" stroke={accent} strokeWidth="1.8" strokeLinecap="round" />
          <path d="M18 10.5l1.8-.9M18 15.5l1.8.9" stroke={accent} strokeWidth="1.7" strokeLinecap="round" />
        </>
      )
    case 'rent':
      return (
        <>
          <path d="M5.5 18.2h13M7 18.2V9.6l5-3.7 5 3.7v8.6" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M10 18.2v-5h4v5" stroke={accent} strokeWidth="1.8" strokeLinejoin="round" />
        </>
      )
    case 'supplies':
      return (
        <>
          <path d="M7 9.5 12 6l5 3.5v6.8L12 19l-5-2.7V9.5Z" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M7.3 9.7 12 12.4l4.7-2.7M12 12.4V19" stroke={accent} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )
    case 'other':
      return (
        <>
          <circle cx="7.5" cy="12" r="1.8" fill={accent} />
          <circle cx="12" cy="12" r="1.8" fill={color} />
          <circle cx="16.5" cy="12" r="1.8" fill={accent} />
        </>
      )
  }
}

export function FinanceMetricIcon({ icon }: MetricIconProps) {
  const tone = ICON_TONES[icon]

  return (
    <span
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-xl shadow-sm"
      style={{ background: tone.bg, boxShadow: '0 4px 10px -3px rgba(28,20,22,0.22)' }}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none">
        <MetricGlyph icon={icon} color={tone.fg} accent={tone.accent} />
      </svg>
    </span>
  )
}

export function FinanceHeaderIcon() {
  return (
    <div
      className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl shadow-sm"
      style={{
        background: 'linear-gradient(135deg,var(--brand) 0%,var(--accent-to) 100%)',
        boxShadow: '0 5px 14px -4px rgba(28,20,22,0.24)',
      }}
      aria-hidden
    >
      <div
        className="absolute h-12 w-12 rounded-full"
        style={{ right: -24, top: -20, backgroundColor: 'rgba(255,255,255,0.16)' }}
      />
      <svg viewBox="0 0 24 24" className="relative h-6 w-6" fill="none">
        <path d="M5 17.5h14" stroke="var(--surface)" strokeWidth="1.9" strokeLinecap="round" />
        <path d="M7 17.5V10l5-3.8 5 3.8v7.5" stroke="var(--surface)" strokeWidth="1.9" strokeLinejoin="round" />
        <path d="M10 17.5v-4h4v4" stroke="rgba(255,255,255,0.62)" strokeWidth="1.9" strokeLinejoin="round" />
        <path d="M8.2 9.6h7.6" stroke="rgba(255,255,255,0.62)" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    </div>
  )
}

export const FinanceNavIcon = forwardRef<SVGSVGElement, LucideProps>(function FinanceNavIcon(
  { color = 'currentColor', size = 24, strokeWidth = 2, style, ...props },
  ref,
) {
  return (
    <svg
      ref={ref}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={style}
      aria-hidden="true"
      {...props}
    >
      <path d="M4.5 17.5h15" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <path d="M6.5 17.5V9.8L12 5.8l5.5 4v7.7" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
      <path d="M9.2 13.7 11.1 12l1.6 1.5 2.5-3" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" opacity="0.72" />
      <path d="M8.6 9.8h6.8" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" opacity="0.72" />
    </svg>
  )
})

export type { MetricIconKey }

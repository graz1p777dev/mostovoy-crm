import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface GlassChartCardProps {
  title: string
  action?: ReactNode
  children: ReactNode
  className?: string
}

export function GlassChartCard({ title, action, children, className }: GlassChartCardProps) {
  return (
    <div
      className={cn(
        'glass rounded-2xl p-4 shadow-[0_8px_32px_-12px_rgba(28,20,22,0.10)]',
        className
      )}
    >
      <div className="flex items-center justify-between mb-3 gap-2">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {action}
      </div>
      {children}
    </div>
  )
}

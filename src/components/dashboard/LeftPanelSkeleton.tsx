import KpiCardSkeleton from '@/components/common/KpiCardSkeleton'

export default function LeftPanelSkeleton() {
  return (
    <div className="px-6 pb-6 flex flex-col gap-5">
      {/* KPI карточки */}
      <div className="grid grid-cols-2 gap-3">
        <KpiCardSkeleton />
        <KpiCardSkeleton />
        <KpiCardSkeleton />
        <KpiCardSkeleton />
      </div>

      {/* График */}
      <div className="flex flex-col gap-2">
        <div className="animate-pulse rounded" style={{ height: 14, width: '40%', backgroundColor: 'var(--paper)' }} />
        <div className="animate-pulse rounded-xl" style={{ height: 160, backgroundColor: 'var(--paper)' }} />
      </div>

      {/* Таблица */}
      <div className="flex flex-col gap-2">
        <div className="animate-pulse rounded" style={{ height: 14, width: '50%', backgroundColor: 'var(--paper)' }} />
        <div className="animate-pulse rounded-xl" style={{ height: 140, backgroundColor: 'var(--paper)' }} />
      </div>
    </div>
  )
}

export default function RightPanelSkeleton() {
  return (
    <div className="px-6 pb-6 flex flex-col gap-5">
      {/* Today Cards */}
      <div className="grid grid-cols-2 gap-3">
        {[0, 1].map(i => (
          <div
            key={i}
            className="rounded-xl animate-pulse"
            style={{ height: 72, backgroundColor: 'rgba(255,255,255,0.7)' }}
          />
        ))}
      </div>
      {/* Live Feed */}
      <div className="flex flex-col gap-2">
        <div className="animate-pulse rounded" style={{ height: 12, width: '40%', backgroundColor: '#ece5e5' }} />
        <div className="animate-pulse rounded-xl" style={{ height: 220, backgroundColor: 'rgba(255,255,255,0.7)' }} />
      </div>
      {/* Team Now */}
      <div className="flex flex-col gap-2">
        <div className="animate-pulse rounded" style={{ height: 12, width: '35%', backgroundColor: '#ece5e5' }} />
        <div className="animate-pulse rounded-xl" style={{ height: 130, backgroundColor: 'rgba(255,255,255,0.7)' }} />
      </div>
      {/* Schedule */}
      <div className="flex flex-col gap-2">
        <div className="animate-pulse rounded" style={{ height: 12, width: '45%', backgroundColor: '#ece5e5' }} />
        <div className="animate-pulse rounded-xl" style={{ height: 150, backgroundColor: 'rgba(255,255,255,0.7)' }} />
      </div>
    </div>
  )
}

export default function KpiCardSkeleton() {
  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3 animate-pulse"
      style={{
        backgroundColor: 'var(--surface)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        border: '1px solid var(--paper)',
      }}
    >
      <div
        className="rounded"
        style={{ height: 12, width: '60%', backgroundColor: 'var(--paper)' }}
      />
      <div
        className="rounded"
        style={{ height: 24, width: '70%', backgroundColor: 'var(--paper)' }}
      />
      <div className="flex flex-col gap-1.5">
        <div
          className="rounded"
          style={{ height: 3, backgroundColor: 'var(--paper)' }}
        />
        <div className="flex justify-between">
          <div className="rounded" style={{ height: 11, width: '40%', backgroundColor: 'var(--paper)' }} />
          <div className="rounded" style={{ height: 11, width: '20%', backgroundColor: 'var(--paper)' }} />
        </div>
      </div>
    </div>
  )
}

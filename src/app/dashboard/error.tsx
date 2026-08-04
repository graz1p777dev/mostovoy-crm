'use client'
import { useEffect } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface DashboardErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function DashboardError({ error, reset }: DashboardErrorProps) {
  useEffect(() => {
    console.error('[Dashboard error]', error)
  }, [error])

  return (
    <div
      className="flex flex-col items-center justify-center gap-4"
      style={{ height: 'calc(100vh - 52px)' }}
    >
      <div
        className="flex items-center justify-center rounded-full"
        style={{ width: 48, height: 48, backgroundColor: 'var(--bad-tint)' }}
      >
        <AlertTriangle style={{ width: 22, height: 22, color: 'var(--brand-ink)' }} />
      </div>
      <div className="text-center">
        <p className="font-semibold" style={{ fontSize: 15, color: 'var(--ink)' }}>
          Ошибка загрузки дашборда
        </p>
        <p style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 4, maxWidth: 320 }}>
          {error.message || 'Что-то пошло не так. Попробуйте обновить страницу.'}
        </p>
      </div>
      <button
        onClick={reset}
        className="flex items-center gap-2 rounded-xl px-4 py-2 font-medium transition-opacity hover:opacity-80"
        style={{
          backgroundColor: 'var(--brand)',
          color: 'var(--on-brand)',
          fontSize: 13,
          cursor: 'pointer',
          border: 'none',
        }}
      >
        <RefreshCw style={{ width: 14, height: 14 }} />
        Попробовать снова
      </button>
    </div>
  )
}

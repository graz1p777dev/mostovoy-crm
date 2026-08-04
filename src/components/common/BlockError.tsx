'use client'
import { useEffect } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface BlockErrorProps {
  error: Error & { digest?: string }
  reset: () => void
  title?: string
}

export default function BlockError({ error, reset, title = 'Ошибка загрузки' }: BlockErrorProps) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div
      className="flex flex-col items-center justify-center gap-3 rounded-xl p-6"
      style={{
        backgroundColor: 'var(--brand-tint)',
        border: '1px solid var(--bad-border-soft)',
        minHeight: 100,
      }}
    >
      <AlertTriangle style={{ width: 20, height: 20, color: 'var(--brand-ink)' }} />
      <div className="text-center">
        <p className="font-medium" style={{ fontSize: 13, color: 'var(--ink)' }}>{title}</p>
        <p style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>
          {error.message || 'Что-то пошло не так'}
        </p>
      </div>
      <button
        onClick={reset}
        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-colors"
        style={{
          backgroundColor: 'var(--bad-tint)',
          border: '1px solid var(--bad-border-soft)',
          fontSize: 12,
          color: 'var(--brand-ink)',
          cursor: 'pointer',
        }}
      >
        <RefreshCw style={{ width: 12, height: 12 }} />
        Попробовать снова
      </button>
    </div>
  )
}

'use client'
import { Component, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
  fallbackTitle?: string
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class DashboardErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error) {
    console.error('[DashboardErrorBoundary]', error)
  }

  reset = () => this.setState({ hasError: false, error: null })

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="flex flex-col items-center justify-center gap-3 rounded-xl p-6 m-4"
          style={{
            backgroundColor: '#fff8f8',
            border: '1px solid #fecaca',
            minHeight: 120,
          }}
        >
          <AlertTriangle style={{ width: 20, height: 20, color: '#c01818' }} />
          <div className="text-center">
            <p className="font-medium" style={{ fontSize: 13, color: '#1b1517' }}>
              {this.props.fallbackTitle ?? 'Ошибка блока'}
            </p>
            <p style={{ fontSize: 12, color: '#7d7174', marginTop: 2 }}>
              {this.state.error?.message || 'Что-то пошло не так'}
            </p>
          </div>
          <button
            onClick={this.reset}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5"
            style={{
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              fontSize: 12,
              color: '#c01818',
              cursor: 'pointer',
            }}
          >
            <RefreshCw style={{ width: 12, height: 12 }} />
            Попробовать снова
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Mail, ArrowLeft } from 'lucide-react'
import { requestPasswordReset } from '@/actions/auth'

function ForgotPasswordContent() {
  const searchParams = useSearchParams()
  const hasExpiredLink = searchParams.get('error') === 'invalid_code'

  const [email, setEmail]     = useState('')
  const [sent, setSent]       = useState(false)
  const [error, setError]     = useState(
    hasExpiredLink ? 'Ссылка истекла или уже использована. Запросите новую.' : ''
  )
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const result = await requestPasswordReset(email)
    setLoading(false)
    if (result.success) {
      setSent(true)
    } else {
      setError(result.error)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ backgroundColor: '#faf8f7' }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-8"
        style={{ backgroundColor: '#ffffff', border: '1px solid #ece5e5', boxShadow: '0 1px 2px rgba(28,20,22,0.04), 0 24px 60px -34px rgba(28,20,22,0.22)' }}
      >
        <a
          href="/auth/login"
          className="inline-flex items-center gap-1.5 text-xs mb-6 transition-colors"
          style={{ color: '#7d7174' }}
        >
          <ArrowLeft style={{ width: 14, height: 14 }} />
          Назад к входу
        </a>

        {sent ? (
          <div className="text-center space-y-3">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center mx-auto"
              style={{ backgroundColor: '#dcfce7' }}
            >
              <span style={{ fontSize: 22 }}>✉️</span>
            </div>
            <h1 className="text-xl font-bold" style={{ color: '#1b1517' }}>Письмо отправлено</h1>
            <p className="text-sm" style={{ color: '#7d7174' }}>
              Если аккаунт с таким email существует, мы отправили ссылку для сброса пароля.
              Проверьте почту и перейдите по ссылке в письме.
            </p>
            <p className="text-xs" style={{ color: '#7d7174' }}>
              Письмо может попасть в «Спам».
            </p>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-bold mb-1" style={{ color: '#1b1517' }}>Восстановление пароля</h1>
            <p className="text-sm mb-6" style={{ color: '#7d7174' }}>
              Укажите email — пришлём ссылку для сброса пароля.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-wide" style={{ color: '#7d7174' }}>
                  Email
                </label>
                <div className="relative">
                  <Mail
                    className="absolute left-3.5 top-1/2 -translate-y-1/2"
                    style={{ width: 15, height: 15, color: '#7d7174' }}
                  />
                  <input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    className="w-full pl-10 pr-4 h-11 rounded-xl text-sm text-[#1b1517] placeholder:text-[#a19698] focus:outline-none transition-all"
                    style={{
                      backgroundColor: '#faf8f7',
                      border: '1px solid #ece5e5',
                    }}
                  />
                </div>
              </div>

              {error && (
                <div
                  className="flex items-center gap-2 text-sm px-4 py-3 rounded-xl"
                  style={{ backgroundColor: '#fdecec', border: '1px solid #f7c0c0', color: '#c01818' }}
                >
                  ⚠ {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 rounded-xl font-semibold text-sm text-white transition-all"
                style={{ backgroundColor: '#e11d1d', opacity: loading ? 0.6 : 1 }}
              >
                {loading ? 'Отправляем...' : 'Отправить ссылку'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ForgotPasswordContent />
    </Suspense>
  )
}

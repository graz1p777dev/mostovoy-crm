'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Eye, EyeOff, Lock } from 'lucide-react'
import { confirmPasswordReset } from '@/actions/auth'
import { PASSWORD_MIN_LENGTH, validatePassword, passwordStrength } from '@/lib/auth-validation'

// Эта страница открывается ПОСЛЕ /auth/callback, который уже обменял code
// на сессию server-side и поставил cookie. Здесь просто форма смены пароля.

export default function ResetPasswordPage() {
  const router = useRouter()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState(false)
  const [loading, setLoading]   = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const pwErr = validatePassword(password)
    if (pwErr) { setError(pwErr); return }
    if (password !== confirm) { setError('Пароли не совпадают'); return }

    setLoading(true)
    const result = await confirmPasswordReset(password)
    setLoading(false)

    if (result.success) {
      setSuccess(true)
      setTimeout(() => router.push('/dashboard'), 2000)
    } else {
      setError(result.error)
    }
  }

  const strength = password.length > 0 ? passwordStrength(password) : null
  const strengthMap = {
    weak:   { label: 'Слабый',  color: 'var(--brand)', width: '33%' },
    medium: { label: 'Средний', color: 'var(--warn)', width: '66%' },
    strong: { label: 'Сильный', color: 'var(--ok)', width: '100%' },
  }

  if (success) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-6"
        style={{ backgroundColor: 'var(--paper)' }}
      >
        <div
          className="w-full max-w-sm rounded-2xl p-8 text-center space-y-3"
          style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--line)', boxShadow: '0 1px 2px rgba(28,20,22,0.04), 0 24px 60px -34px rgba(28,20,22,0.22)' }}
        >
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center mx-auto"
            style={{ backgroundColor: 'var(--ok-soft)' }}
          >
            <CheckCircle2 style={{ width: 24, height: 24, color: 'var(--ok-base-2)' }} />
          </div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--ink)' }}>Пароль обновлён</h1>
          <p className="text-sm" style={{ color: 'var(--ink-3)' }}>
            Перенаправляем в личный кабинет...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ backgroundColor: 'var(--paper)' }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-8"
        style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--line)', boxShadow: '0 1px 2px rgba(28,20,22,0.04), 0 24px 60px -34px rgba(28,20,22,0.22)' }}
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
          style={{ backgroundColor: 'rgba(225,29,29,0.4)' }}
        >
          <Lock style={{ width: 18, height: 18, color: 'var(--ink-3)' }} />
        </div>
        <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--ink)' }}>Новый пароль</h1>
        <p className="text-sm mb-6" style={{ color: 'var(--ink-3)' }}>
          Придумайте надёжный пароль для вашего аккаунта.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--ink-3)' }}>
              Новый пароль
            </label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                placeholder={`Мин. ${PASSWORD_MIN_LENGTH} символов`}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full pl-4 pr-10 h-11 rounded-xl text-sm text-[var(--ink)] placeholder:text-[var(--ink-4)] focus:outline-none transition-all"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.1)',
                }}
              />
              <button
                type="button"
                onClick={() => setShowPass(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--ink-3)' }}
                tabIndex={-1}
              >
                {showPass
                  ? <EyeOff style={{ width: 15, height: 15 }} />
                  : <Eye style={{ width: 15, height: 15 }} />
                }
              </button>
            </div>

            {strength && (
              <div className="space-y-1 pt-1">
                <div className="h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: strengthMap[strength].width,
                      backgroundColor: strengthMap[strength].color,
                    }}
                  />
                </div>
                <p className="text-[11px]" style={{ color: strengthMap[strength].color }}>
                  {strengthMap[strength].label}
                </p>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--ink-3)' }}>
              Подтверждение
            </label>
            <input
              type={showPass ? 'text' : 'password'}
              placeholder="Повторите пароль"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              className="w-full px-4 h-11 rounded-xl text-sm text-[var(--ink)] placeholder:text-[var(--ink-4)] focus:outline-none transition-all"
              style={{
                backgroundColor: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            />
          </div>

          <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>
            Мин. {PASSWORD_MIN_LENGTH} символов, одна заглавная буква, одна цифра.
          </p>

          {error && (
            <div
              className="flex items-center gap-2 text-sm px-4 py-3 rounded-xl"
              style={{ backgroundColor: 'var(--brand-soft)', border: '1px solid var(--brand-soft-border)', color: 'var(--brand-ink)' }}
            >
              ⚠ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-11 rounded-xl font-semibold text-sm text-white transition-all"
            style={{ backgroundColor: 'var(--brand)', opacity: loading ? 0.6 : 1 }}
          >
            {loading ? 'Сохраняем...' : 'Сохранить пароль'}
          </button>
        </form>
      </div>
    </div>
  )
}

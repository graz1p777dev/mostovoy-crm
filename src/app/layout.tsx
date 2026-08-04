import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import './globals.css'
import { AuthProvider } from '@/contexts/AuthContext'
import { getImpersonationState } from '@/actions/auth'
import { createClient } from '@/lib/supabase/server'
import { Toaster } from 'sonner'
import { Employee } from '@/types'
import { DEFAULT_ACCENT, ACCENT_COOKIE_NAME, isAccentId } from '@/lib/accent-theme'
import { BRAND } from '@/config/brand'
import { buildBrandCss } from '@/config/brand-css'
import { getBrandFonts } from '@/config/brand-fonts'

const fonts = getBrandFonts(BRAND.fonts.sans, BRAND.fonts.display)

// Определения всех токенов собираются из бренд-конфига один раз на модуль.
const brandCss = buildBrandCss()

export const metadata: Metadata = {
  title: BRAND.identity.title,
  description: BRAND.identity.description,
}

// Root layout — читает сессию и employee один раз на SSR.
// Передаёт данные в AuthProvider как начальное состояние:
// клиент стартует с уже известным пользователем, без race condition onAuthStateChange.
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const jar = await cookies()
  const accentCookie = jar.get(ACCENT_COOKIE_NAME)?.value
  const accent = isAccentId(accentCookie) ? accentCookie : DEFAULT_ACCENT

  const supabase = await createClient()

  // Параллельно получаем сессию и состояние impersonation.
  const [{ data: { session } }, initialImpersonation] = await Promise.all([
    supabase.auth.getSession(),
    getImpersonationState(),
  ])

  let initialEmployee: Employee | null = null
  let initialRealUser: Employee | null = null

  if (session?.user) {
    const { data: emp } = await supabase
      .from('employees')
      .select('*')
      .eq('user_id', session.user.id)
      .is('deleted_at', null)
      .single()

    if (emp) {
      const employee = emp as Employee

      if (employee.role === 'owner' && initialImpersonation) {
        // Режим impersonation: realUser = owner, user = цель impersonation.
        const { data: targetEmp } = await supabase
          .from('employees')
          .select('*')
          .eq('id', initialImpersonation.id)
          .is('deleted_at', null)
          .single()

        initialRealUser = employee
        initialEmployee = (targetEmp as Employee | null) ?? employee
      } else {
        initialEmployee = employee
      }
    }
  }

  return (
    <html lang="ru" className={`h-full ${fonts.variables}`} data-accent={accent}>
      <body className={`${fonts.bodyClassName} min-h-full bg-background`}>
        {/* Токены бренда. Рендерятся на сервере, поэтому первый кадр уже
            приходит в фирменных цветах — мигания нет. */}
        <style id="brand-tokens" dangerouslySetInnerHTML={{ __html: brandCss }} />
        <AuthProvider
          initialEmployee={initialEmployee}
          initialRealUser={initialRealUser}
          initialImpersonation={initialImpersonation}
        >
          {children}
        </AuthProvider>
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              color: 'var(--ink)',
              borderRadius: '12px',
              boxShadow: '0 12px 32px -14px rgba(28,20,22,0.24)',
            },
          }}
        />
      </body>
    </html>
  )
}

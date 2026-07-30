// Локальная разработка: если включён AUTH_BYPASS=1, форму входа не показываем,
// а сразу уводим на /auth/dev-login — он логинится под владельцем из .env.local.
//
// Проверка живёт здесь, а не в middleware: middleware выполняется в Edge-рантайме,
// где серверные переменные окружения недоступны. Layout — серверный компонент
// на Node, здесь process.env читается штатно.
//
// На проде AUTH_BYPASS не задан, поэтому редиректа нет и форма входа работает
// как обычно.
import { redirect } from 'next/navigation'

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  if (process.env.AUTH_BYPASS === '1') {
    redirect('/auth/dev-login')
  }
  return <>{children}</>
}

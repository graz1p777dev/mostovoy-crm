import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Проверяем токен через GoTrue, а не доверяем данным из cookie.
  const { data: { user } } = await supabase.auth.getUser()

  const pathname      = request.nextUrl.pathname
  // /chat/[leadId] — история чата по ссылке из Telegram-карточки бота
  const isDashboard   = pathname.startsWith('/dashboard') || pathname.startsWith('/chat')
  const isInventory   = pathname.startsWith('/inventory')
  const isCashier     = pathname === '/cashier'
  const isAuthPage    = pathname.startsWith('/auth')

  // Без сессии — только публичные auth-страницы
  if ((isDashboard || isInventory || isCashier) && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    return NextResponse.redirect(url)
  }

  // Кассир не получает доступ к CRM и товароучёту даже при прямом вводе URL.
  // Роль берём из той же таблицы employees, которую используют RLS и Inventory.
  if (user && (isDashboard || isInventory)) {
    const { data: employee } = await supabase
      .from('employees')
      .select('role')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle()

    if (employee?.role === 'cashier') {
      const url = request.nextUrl.clone()
      url.pathname = '/cashier'
      return NextResponse.redirect(url)
    }
  }

  // /auth/reset-password и /auth/change-password требуют активную сессию — не редиректим
  const isSessionRequired = pathname === '/auth/reset-password' || pathname === '/auth/change-password'
  if (isAuthPage && !isSessionRequired && user) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/chat/:path*',
    '/inventory/:path*',
    '/cashier',
    '/auth/:path*',
  ],
}

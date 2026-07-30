import { createServerClient } from '@supabase/ssr'

// Создаёт SSR-клиент Supabase с явным access_token через Authorization header.
// Используется в Server Components внутри Suspense (во время стриминга),
// где вызов cookies() не допускается.
//
// ВАЖНО: используем createServerClient из @supabase/ssr (НЕ createClient из @supabase/supabase-js).
// createClient из supabase-js инициализирует WebSocket для Realtime — это блокирует Node.js
// на сервере и вызывает задержку 3-5 минут (WebSocket timeout + exponential backoff).
// createServerClient из @supabase/ssr не создаёт Realtime-соединение.
export function createTokenClient(accessToken: string) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return [] },
        setAll() {},
      },
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    }
  )
}

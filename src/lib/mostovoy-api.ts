// Клиент админ-API витрины «МОСТОВОЙ» (отдельный сервис: Express + SQLite).
// Витрина — источник истины по товарам и новостям, CRM ими только управляет.
//
// ВАЖНО: только для серверного кода (Server Components, Server Actions, Route
// Handlers). MOSTOVOY_ADMIN_TOKEN не имеет префикса NEXT_PUBLIC_ и не должен
// попадать в браузер — поэтому здесь нет 'use client' и файл не импортируется
// из клиентских компонентов.

const DEFAULT_TIMEOUT_MS = 15_000

export interface MostovoyApiFailure {
  ok: false
  /** Сообщение витрины как есть — там валидация уже на русском. */
  error: string
  status: number
}

export type MostovoyApiResult<T> = { ok: true; data: T } | MostovoyApiFailure

function baseUrl(): string | null {
  return process.env.MOSTOVOY_API_URL?.replace(/\/$/, '') || null
}

/** Настроена ли интеграция — страницы показывают подсказку вместо пустого экрана. */
export function isMostovoyConfigured(): boolean {
  return Boolean(baseUrl() && process.env.MOSTOVOY_ADMIN_TOKEN)
}

/**
 * Запрос к /api/admin/* витрины с админ-токеном.
 * Ошибки витрины (400/404/409/422) возвращаются как значение, а не бросаются —
 * её русские тексты валидации показываем пользователю дословно.
 */
export async function mostovoyFetch<T>(
  path: string,
  init: { method?: string; body?: unknown; formData?: FormData } = {}
): Promise<MostovoyApiResult<T>> {
  const base = baseUrl()
  const token = process.env.MOSTOVOY_ADMIN_TOKEN
  if (!base || !token) {
    return { ok: false, status: 503, error: 'Интеграция с витриной не настроена: задайте MOSTOVOY_API_URL и MOSTOVOY_ADMIN_TOKEN' }
  }

  const headers: Record<string, string> = { 'x-admin-token': token }
  let body: BodyInit | undefined
  if (init.formData) {
    // Content-Type для multipart выставляет сам fetch — вместе с boundary.
    body = init.formData
  } else if (init.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(init.body)
  }

  let response: Response
  try {
    response = await fetch(`${base}/api/admin${path}`, {
      method: init.method ?? 'GET',
      headers,
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    })
  } catch {
    return { ok: false, status: 502, error: 'Витрина недоступна — проверьте, что сервер магазина запущен' }
  }

  const text = await response.text()
  let payload: unknown = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = null
    }
  }

  if (!response.ok) {
    const record = (payload ?? {}) as { error?: unknown; message?: unknown }
    const error =
      (typeof record.error === 'string' && record.error) ||
      (typeof record.message === 'string' && record.message) ||
      `Ошибка витрины (${response.status})`
    return { ok: false, status: response.status, error }
  }

  return { ok: true, data: (payload ?? {}) as T }
}

/** Абсолютный URL картинки витрины: /uploads/... и /images/... лежат на её домене. */
export function mostovoyImageUrl(url: string | null): string | null {
  if (!url) return null
  if (/^https?:\/\//i.test(url)) return url
  const base = baseUrl()
  return base ? `${base}${url.startsWith('/') ? '' : '/'}${url}` : url
}

/** Публичный адрес витрины — для ссылок «посмотреть на сайте». */
export function mostovoyPublicUrl(): string | null {
  return baseUrl()
}

// ─── Защита от SSRF при сохранении URL, введённых пользователем ────────────
// Мостовой CRM делает реальный HTTP-запрос к этим адресам (тест соединения),
// поэтому адрес обязан быть публичным HTTPS-хостом — иначе владелец мог бы
// (случайно или нет) заставить сервер сходить на внутреннюю инфраструктуру.
// Паттерн — 1:1 assertSafeUrl из AzisCRM (src/services/integrationMarketplace.js).

export function assertSafeUrl(value: string, label: string): URL {
  let url: URL
  try {
    url = new URL(String(value || '').trim())
  } catch {
    throw new Error(`${label}: укажите корректный URL`)
  }

  const host = url.hostname.toLowerCase()
  const isPrivate =
    url.protocol !== 'https:' ||
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host.endsWith('.local') ||
    /^169\.254\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)

  if (isPrivate) {
    throw new Error(`${label}: разрешён только публичный HTTPS-адрес`)
  }

  return url
}

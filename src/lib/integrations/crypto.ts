// ─── Шифрование учётных данных интеграций (AES-256-GCM) ────────────────────
// Паттерн взят из AzisCRM (src/services/integrationMarketplace.js): ключ не
// хранится в БД, выводится из секрета окружения через SHA-256. IV случайный
// на каждую запись, тег аутентификации проверяется при расшифровке.
// Импортировать ТОЛЬКО из Server Actions / Route Handlers — никогда из
// клиентского кода (ключ не должен попасть в браузер).

import crypto from 'crypto'

function keyBuffer(): Buffer {
  const secret = process.env.INTEGRATION_ENCRYPTION_KEY
  if (!secret) {
    throw new Error(
      'INTEGRATION_ENCRYPTION_KEY не задан в окружении — сохранение учётных данных интеграций невозможно',
    )
  }
  return crypto.createHash('sha256').update(secret).digest()
}

/** Шифрует произвольный JSON-сериализуемый объект в base64url-строку `iv.tag.body`. */
export function encryptConfig(value: unknown): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer(), iv)
  const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv, tag, body].map(part => part.toString('base64url')).join('.')
}

/** Расшифровывает строку, сохранённую encryptConfig. */
export function decryptConfig<T = Record<string, unknown>>(blob: string): T {
  const parts = blob.split('.')
  if (parts.length !== 3) throw new Error('Повреждённые данные конфигурации интеграции')
  const [ivB64, tagB64, bodyB64] = parts
  const iv = Buffer.from(ivB64, 'base64url')
  const tag = Buffer.from(tagB64, 'base64url')
  const body = Buffer.from(bodyB64, 'base64url')
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer(), iv)
  decipher.setAuthTag(tag)
  const decrypted = Buffer.concat([decipher.update(body), decipher.final()])
  return JSON.parse(decrypted.toString('utf8')) as T
}

/** Случайный секрет для URL входящего вебхука (Bitrix24/amoCRM не шлют кастомные заголовки). */
export function generateWebhookSecret(): string {
  return crypto.randomBytes(24).toString('base64url')
}

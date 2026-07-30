// Общие хелперы для номера телефона — переиспользуются и в серверных
// экшенах (@/actions/whatsapp), и в клиентских компонентах, поэтому не могут
// жить внутри 'use server' файла (там разрешены только async-экспорты).

export function digitsOnly(s: string): string {
  return s.replace(/\D/g, '')
}

export function toLocal9(s: string): string {
  const d = digitsOnly(s)
  return d.startsWith('996') ? d.slice(3) : d.slice(-9)
}

export function toWazzupChatId(phone: string): string {
  return `996${toLocal9(phone)}`
}

// Маска номера в формате "+996 (700) 123-456".
export function applyPhoneMask(raw: string): string {
  const digits = digitsOnly(raw)
  const local = digits.startsWith('996') ? digits.slice(3) : digits
  const d = local.slice(0, 9)

  if (!d.length) return ''
  if (d.length <= 3) return `+996 (${d}`
  if (d.length <= 6) return `+996 (${d.slice(0, 3)}) ${d.slice(3)}`
  return `+996 (${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

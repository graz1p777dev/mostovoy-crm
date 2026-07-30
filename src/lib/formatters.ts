const RU_MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
]

const RU_MONTHS_SHORT = [
  'янв', 'фев', 'мар', 'апр', 'май', 'июн',
  'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
]

export function formatMoney(amount: number, currency = 'KGS'): string {
  const rounded = Math.round(amount)
  const formatted = rounded.toLocaleString('ru-RU').replace(/,/g, ' ')
  return `${formatted} ${currency}`
}

export function formatMoneyShort(amount: number): string {
  if (Math.abs(amount) >= 1_000_000) {
    return `${(amount / 1_000_000).toFixed(1)}M`
  }
  if (Math.abs(amount) >= 1_000) {
    return `${(amount / 1_000).toFixed(0)}K`
  }
  return String(Math.round(amount))
}

export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getDate()} ${RU_MONTHS_SHORT[d.getMonth()]}`
}

export function formatDateFull(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getDate()} ${RU_MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  return `${day}.${month}.${d.getFullYear()}`
}

export function formatTime(timeStr: string): string {
  if (!timeStr) return ''
  return timeStr.substring(0, 5)
}

export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('996') && digits.length === 12) {
    return `+996 ${digits.slice(3, 6)} ${digits.slice(6, 9)}-${digits.slice(9, 11)}-${digits.slice(11)}`
  }
  if (digits.length === 9) {
    return `+996 ${digits.slice(0, 3)} ${digits.slice(3, 6)}-${digits.slice(6, 8)}-${digits.slice(8)}`
  }
  return phone
}

export function getInitials(name: string): string {
  const words = name.match(/[\p{L}\p{N}]+/gu) ?? []
  const firstInitial = words[0]?.[0] ?? ''
  const secondInitial = words[1]?.[0] ?? ''
  if (secondInitial) return (firstInitial + secondInitial).toUpperCase()
  return (words[0]?.slice(0, 2) ?? '').toUpperCase()
}

export function getDayGreeting(): string {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 12) return 'Доброе утро'
  if (hour >= 12 && hour < 17) return 'Добрый день'
  return 'Добрый вечер'
}

export function formatDealNumber(raw: string | null): string {
  if (!raw) return ''
  const digits = raw.replace(/\D/g, '')
  return digits ? `#${digits}` : ''
}

export function formatNumber(value: number): string {
  return value.toLocaleString('ru-RU')
}

export function getRuMonthName(month: number): string {
  return RU_MONTHS[month - 1] ?? ''
}

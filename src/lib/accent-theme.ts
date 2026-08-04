// Акцентная тема — общий источник правды для сервера (layout.tsx) и клиента
// (панель в Настройках). Хранится в обычной (не httpOnly) cookie на устройстве —
// это чисто визуальная настройка, не связана с аккаунтом пользователя.
//
// Сами пресеты и дефолт живут в бренд-конфиге (src/config/brand.ts): список
// акцентов — часть фирменного стиля и меняется при перекраске под клиента.
// Здесь остались только работа с cookie и валидация значения.
//
// Токены пресетов генерируются из того же конфига (src/config/brand-css.ts)
// в блоки :root[data-accent='…'], поэтому список здесь и CSS не могут
// разъехаться по определению.

import { BRAND } from '@/config/brand'

export const ACCENT_COOKIE_NAME = 'accent'
export const DEFAULT_ACCENT = BRAND.defaultAccent

// Образцы для панели выбора в Настройках: id, подпись и два конца градиента.
export const ACCENT_PRESETS = BRAND.accents.map(a => ({
  id: a.id,
  label: a.label,
  from: a.from,
  to: a.to,
}))

export type AccentId = string

const ACCENT_IDS = new Set<string>(BRAND.accents.map(p => p.id))

// Устаревшая cookie (например, 'violet' из донорского приложения) не пройдёт
// проверку и мягко вернётся к дефолту.
export function isAccentId(value: string | undefined): value is AccentId {
  return !!value && ACCENT_IDS.has(value)
}

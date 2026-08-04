import type { LucideIcon } from 'lucide-react'
import { Send, MessageCircle, Camera, PenLine, Globe } from 'lucide-react'
import type { DealCurrency, DealSource } from '@/types'

// ─── Каналы, из которых приходят сделки ──────────────────────────────────────
// Этапы воронки задаются в БД (deal_stages) и приходят с сервера — здесь
// только то, что действительно константа: набор каналов и валюты.

export interface DealSourceMeta {
  label: string
  icon: LucideIcon
  /** Цвет текста бейджа — яркий и читаемый на светлой заливке. */
  color: string
  bg: string
}

// Цвета каналов — фирменные цвета самих мессенджеров, а не нашего бренда:
// Telegram синий, WhatsApp зелёный, Instagram розовый. Они опознают источник
// заявки и при перекраске CRM под другого клиента меняться НЕ должны, поэтому
// намеренно оставлены литералами и не вынесены в бренд-конфиг.
// Исключение — «Вручную»: это не внешний канал, он живёт на нейтральных токенах.
export const DEAL_SOURCE: Record<DealSource, DealSourceMeta> = {
  telegram:  { label: 'Telegram',  icon: Send,          color: '#0369a1', bg: '#e0f2fe' },
  whatsapp:  { label: 'WhatsApp',  icon: MessageCircle, color: '#15803d', bg: '#dcfce7' },
  instagram: { label: 'Instagram', icon: Camera,        color: '#be185d', bg: '#fce7f3' },
  site:      { label: 'Сайт',      icon: Globe,         color: '#0e7490', bg: '#cffafe' },
  manual:    { label: 'Вручную',   icon: PenLine,       color: 'var(--ink-2)', bg: 'var(--surface-3)' },
}

export const DEAL_CURRENCIES: DealCurrency[] = ['KGS', 'USD', 'RUB']

/** Сколько сделка стоит в текущем этапе — коротко, для карточки. */
export function formatStageAge(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
  if (minutes < 60) return `${minutes} мин`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} ч`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days} дн`
  return `${Math.round(days / 30)} мес`
}

/** Мягкая заливка под цвет этапа — счётчики и полоски колонок. */
export function stageSoft(color: string, alpha = 0.14): string {
  const hex = color.replace('#', '')
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

import type { LucideIcon } from 'lucide-react'
import { Circle, Timer, Eye, CheckCircle2, Globe, Building2, Lock } from 'lucide-react'
import type { TaskStatus, TaskPriority, TaskVisibility } from '@/types'

// ─── Колонки канбана (фиксированные этапы) ───────────────────────────────────

export interface TaskColumn {
  key: TaskStatus
  label: string
  icon: LucideIcon
  accent: string // цвет заголовка/полоски колонки
  soft: string   // мягкая заливка бейджа-счётчика
}

export const TASK_COLUMNS: TaskColumn[] = [
  { key: 'todo',        label: 'К выполнению', icon: Circle,       accent: 'var(--ink-25)', soft: 'rgba(125,113,116,0.16)' },
  { key: 'in_progress', label: 'В работе',     icon: Timer,        accent: 'var(--brand-ink)', soft: 'rgba(225,29,29,0.13)'   },
  { key: 'review',      label: 'На проверке',  icon: Eye,          accent: 'var(--warn-strong)', soft: 'rgba(217,119,6,0.14)'   },
  { key: 'done',        label: 'Готово',       icon: CheckCircle2, accent: 'var(--ok-strong)', soft: 'rgba(22,163,74,0.14)'   },
]

export const TASK_STATUS_LABEL: Record<TaskStatus, string> =
  Object.fromEntries(TASK_COLUMNS.map((c) => [c.key, c.label])) as Record<TaskStatus, string>

// ─── Приоритеты ──────────────────────────────────────────────────────────────

export const TASK_PRIORITY: Record<
  TaskPriority,
  { label: string; color: string; bg: string }
> = {
  low:    { label: 'Низкий',  color: 'var(--ink-25)', bg: 'var(--paper-2)' },
  medium: { label: 'Средний', color: 'var(--brand)', bg: 'var(--brand-soft)' },
  high:   { label: 'Высокий', color: 'var(--warn)', bg: 'var(--warn-soft)' },
  urgent: { label: 'Срочный', color: 'var(--brand-ink)', bg: 'var(--bad-soft)' },
}

export const TASK_PRIORITY_ORDER: TaskPriority[] = ['low', 'medium', 'high', 'urgent']

// ─── Видимость ───────────────────────────────────────────────────────────────

export const TASK_VISIBILITY: Record<
  TaskVisibility,
  { label: string; icon: LucideIcon; hint: string }
> = {
  all:        { label: 'Все сотрудники', icon: Globe,      hint: 'Задачу видят все' },
  department: { label: 'Только отдел',   icon: Building2,   hint: 'Видят сотрудники отдела' },
  private:    { label: 'Личная',         icon: Lock,        hint: 'Видят автор, исполнитель и участники' },
}

export const TASK_VISIBILITY_ORDER: TaskVisibility[] = ['all', 'department', 'private']

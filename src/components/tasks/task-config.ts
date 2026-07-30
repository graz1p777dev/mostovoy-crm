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
  { key: 'todo',        label: 'К выполнению', icon: Circle,       accent: '#6b6063', soft: 'rgba(125,113,116,0.16)' },
  { key: 'in_progress', label: 'В работе',     icon: Timer,        accent: '#c01818', soft: 'rgba(225,29,29,0.13)'   },
  { key: 'review',      label: 'На проверке',  icon: Eye,          accent: '#92400e', soft: 'rgba(217,119,6,0.14)'   },
  { key: 'done',        label: 'Готово',       icon: CheckCircle2, accent: '#166534', soft: 'rgba(22,163,74,0.14)'   },
]

export const TASK_STATUS_LABEL: Record<TaskStatus, string> =
  Object.fromEntries(TASK_COLUMNS.map((c) => [c.key, c.label])) as Record<TaskStatus, string>

// ─── Приоритеты ──────────────────────────────────────────────────────────────

export const TASK_PRIORITY: Record<
  TaskPriority,
  { label: string; color: string; bg: string }
> = {
  low:    { label: 'Низкий',  color: '#6b6063', bg: '#fdfbfb' },
  medium: { label: 'Средний', color: '#e11d1d', bg: '#fdecec' },
  high:   { label: 'Высокий', color: '#b45309', bg: '#fef3c7' },
  urgent: { label: 'Срочный', color: '#c01818', bg: '#fee2e2' },
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

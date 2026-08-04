import type { Section } from '@/lib/authz'

export const ALL_SECTIONS: Section[] = [
  'dashboard', 'consultations', 'decomposition', 'salaries', 'finances',
  'marketing', 'employees', 'calendar', 'attendance', 'tasks',
  'notifications', 'documents', 'investors', 'kpi_settings', 'settings', 'integrations',
  'vacations',
]

export const SECTION_LABELS: Record<Section, string> = {
  dashboard: 'Дашборд',
  consultations: 'Записи',
  decomposition: 'Декомпозиция',
  salaries: 'Зарплата',
  finances: 'Финансы',
  marketing: 'Маркетинг',
  employees: 'Сотрудники',
  calendar: 'Календарь',
  attendance: 'Посещаемость',
  vacations: 'Отпуска',
  tasks: 'Задачи',
  notifications: 'Уведомления',
  documents: 'Документы',
  investors: 'Инвесторы',
  kpi_settings: 'KPI-настройки',
  settings: 'Настройки',
  integrations: 'Интеграции',
}

// Типы и форматирование для audit_logs. Отдельно от src/actions/audit.ts,
// потому что модуль с 'use server' может экспортировать только async-функции.

export type AuditAction = 'create' | 'update' | 'delete'

export interface AuditRow {
  id: string
  action: AuditAction
  resourceType: string
  summary: string
  employeeName: string | null
  createdAt: string
}

const SECTION_RU: Record<string, string> = {
  department: 'Отделы',
  role: 'Роли',
  work_schedule: 'Графики',
  employee: 'Сотрудники',
  employee_kpi: 'KPI-планы',
}

export function auditSectionLabel(resourceType: string): string {
  return SECTION_RU[resourceType] ?? resourceType
}

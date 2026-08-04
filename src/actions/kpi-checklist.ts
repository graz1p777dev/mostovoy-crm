'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getViewer, isManager } from '@/lib/decomposition/viewer'
import { can, actorFromViewer } from '@/lib/authz'

export type ActionResult = { success: true } | { success: false; error: string }

// ─── Общий KPI-чеклист сотрудника (самоотметка на экранах декомпозиции) ───────

export interface ChecklistItem {
  id:           string
  name:         string
  description:  string | null
  bonus_amount: number
  is_completed: boolean
}

export interface KpiChecklist {
  items:     ChecklistItem[]
  isClosed:  boolean
  canToggle: boolean
  year:      number
  month:     number
}

/** Чеклист текущего месяца: сам сотрудник или owner/руководитель за него */
export async function getKpiChecklist(employeeId: string): Promise<KpiChecklist | null> {
  const viewer = await getViewer()
  if (!viewer) return null
  const isSelf = viewer.id === employeeId
  if (!isSelf && !isManager(viewer)) return null
  if (!await can(actorFromViewer(viewer), 'decomposition', 'view')) return null

  const admin = createAdminClient()
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  const { data: emp } = await admin
    .from('employees')
    .select('role')
    .eq('id', employeeId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!emp) return null

  const [{ data: items }, { data: results }, { data: kpiRes }] = await Promise.all([
    admin
      .from('kpi_items')
      .select('id, name, description, bonus_amount, sort_order, kpi_role_settings!inner(role_name)')
      .eq('is_active', true)
      .eq('kpi_role_settings.role_name', emp.role as string)
      .order('sort_order'),
    admin
      .from('employee_kpi_item_results')
      .select('kpi_item_id, is_completed')
      .eq('employee_id', employeeId)
      .eq('period_year', year)
      .eq('period_month', month),
    admin
      .from('employee_kpi_results')
      .select('is_closed')
      .eq('employee_id', employeeId)
      .eq('period_year', year)
      .eq('period_month', month)
      .maybeSingle(),
  ])

  const doneMap = new Map((results ?? []).map(r => [r.kpi_item_id as string, r.is_completed as boolean]))
  const isClosed = (kpiRes?.is_closed as boolean) ?? false

  return {
    items: (items ?? []).map(it => ({
      id:           it.id as string,
      name:         it.name as string,
      description:  it.description as string | null,
      bonus_amount: Number(it.bonus_amount),
      is_completed: doneMap.get(it.id as string) ?? false,
    })),
    isClosed,
    canToggle: !isClosed,
    year,
    month,
  }
}

/** Отметка пункта: сам сотрудник (только свои пункты своей роли) или owner/руководитель */
export async function toggleKpiChecklistItem(
  employeeId: string,
  kpiItemId: string,
  isCompleted: boolean,
): Promise<ActionResult> {
  const viewer = await getViewer()
  if (!viewer) return { success: false, error: 'Нет сессии' }

  const isSelf = viewer.id === employeeId
  if (!isSelf && !isManager(viewer)) return { success: false, error: 'Недостаточно прав' }
  if (!await can(actorFromViewer(viewer), 'decomposition', 'edit')) return { success: false, error: 'Недостаточно прав' }

  const admin = createAdminClient()
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  // Пункт обязан принадлежать роли целевого сотрудника —
  // чужой пункт не отметить даже по подобранному id
  const { data: emp } = await admin
    .from('employees')
    .select('role')
    .eq('id', employeeId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!emp) return { success: false, error: 'Сотрудник не найден' }

  const { data: item } = await admin
    .from('kpi_items')
    .select('id, kpi_role_settings!inner(role_name)')
    .eq('id', kpiItemId)
    .eq('is_active', true)
    .eq('kpi_role_settings.role_name', emp.role as string)
    .maybeSingle()
  if (!item) return { success: false, error: 'KPI-пункт не относится к роли сотрудника' }

  // Существующая защита закрытого месяца сохраняется
  const { data: res } = await admin
    .from('employee_kpi_results')
    .select('is_closed')
    .eq('employee_id', employeeId)
    .eq('period_year', year)
    .eq('period_month', month)
    .maybeSingle()
  if (res?.is_closed) return { success: false, error: 'Месяц закрыт — изменения недоступны' }

  // Триггер на employee_kpi_item_results пересчитает items_bonus —
  // отметка сразу видна на экране «Зарплата»
  const { error } = await admin
    .from('employee_kpi_item_results')
    .upsert(
      {
        employee_id:  employeeId,
        kpi_item_id:  kpiItemId,
        period_year:  year,
        period_month: month,
        is_completed: isCompleted,
      },
      { onConflict: 'employee_id,kpi_item_id,period_year,period_month' },
    )
  if (error) return { success: false, error: error.message }

  revalidatePath('/dashboard/decomposition')
  revalidatePath('/dashboard/salary')
  return { success: true }
}

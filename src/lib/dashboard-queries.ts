import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  PlanVsFactRow,
  DashboardMonthStats,
  DashboardTodayStats,
  LiveFeedItem,
  TeamMemberStatus,
  AttendanceStatus,
  UserRole,
} from '@/types'

// ─────────────────────────────────────────────
// Вспомогательные типы
// ─────────────────────────────────────────────

export interface WeekRevenuePoint {
  week: string
  revenue: number
  label: string
}

// ─────────────────────────────────────────────
// KPI статистика за месяц
// ─────────────────────────────────────────────

export async function getMonthKpiStats(
  supabase: SupabaseClient,
  year: number,
  month: number,
  employeeId?: string
): Promise<DashboardMonthStats> {
  const t0 = Date.now()
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const endDate = new Date(year, month, 0)
  const endDateStr = `${year}-${String(month).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`

  // Факт: данные из sales_plan_weekly (агрегированы триггером)
  let decompositionQuery = supabase
    .from('sales_plan_weekly')
    .select('total_fv_fact, total_sales_fact, total_revenue_fact, kpi_pct, total_fv_plan, total_sales_plan, total_revenue_plan')
    .eq('period_year', year)
    .eq('period_month', month)

  if (employeeId) {
    decompositionQuery = decompositionQuery.eq('employee_id', employeeId)
  }

  const { data: decompositionRows } = await decompositionQuery

  console.log(`[kpi] decompositionQuery: ${Date.now() - t0}ms`)
  if (!decompositionRows || decompositionRows.length === 0) {
    // Если нет строк декомпозиции — считаем из консультаций напрямую
    let consultQuery = supabase
      .from('consultations')
      .select('status_after_fv, amount, is_nv')
      .gte('date', startDate)
      .lte('date', endDateStr)
      .is('deleted_at', null)

    if (employeeId) {
      consultQuery = consultQuery.eq('manager_id', employeeId)
    }

    const { data: consults } = await consultQuery
    console.log(`[kpi] fallback consultQuery: ${Date.now() - t0}ms`)

    const fv = consults?.filter(c =>
      c.status_after_fv !== null && c.status_after_fv !== undefined
    ).length ?? 0

    const sales = consults?.filter(c =>
      c.status_after_fv === 'Купила' || c.status_after_fv === 'Предоплата'
    ).length ?? 0

    const revenue = consults?.reduce((sum, c) => {
      if (c.status_after_fv === 'Купила' || c.status_after_fv === 'Предоплата') {
        return sum + (Number(c.amount) || 0)
      }
      return sum
    }, 0) ?? 0

    return { fv, sales, revenue, kpi_pct: 0, plan_fv: 0, plan_sales: 0, plan_revenue: 0 }
  }

  // Суммируем по всем строкам (если несколько сотрудников)
  const totals = decompositionRows.reduce(
    (acc, row) => ({
      fv: acc.fv + (Number(row.total_fv_fact) || 0),
      sales: acc.sales + (Number(row.total_sales_fact) || 0),
      revenue: acc.revenue + (Number(row.total_revenue_fact) || 0),
      plan_fv: acc.plan_fv + (Number(row.total_fv_plan) || 0),
      plan_sales: acc.plan_sales + (Number(row.total_sales_plan) || 0),
      plan_revenue: acc.plan_revenue + (Number(row.total_revenue_plan) || 0),
      kpi_sum: acc.kpi_sum + (Number(row.kpi_pct) || 0),
    }),
    { fv: 0, sales: 0, revenue: 0, plan_fv: 0, plan_sales: 0, plan_revenue: 0, kpi_sum: 0 }
  )

  const kpi_pct = decompositionRows.length > 0
    ? totals.kpi_sum / decompositionRows.length
    : 0

  return {
    fv: totals.fv,
    sales: totals.sales,
    revenue: totals.revenue,
    kpi_pct: Math.round(kpi_pct * 10) / 10,
    plan_fv: totals.plan_fv,
    plan_sales: totals.plan_sales,
    plan_revenue: totals.plan_revenue,
  }
}

// ─────────────────────────────────────────────
// Выручка по неделям месяца
// ─────────────────────────────────────────────

export async function getRevenueByWeeks(
  supabase: SupabaseClient,
  year: number,
  month: number,
  employeeId?: string
): Promise<WeekRevenuePoint[]> {
  const t0 = Date.now()
  const daysInMonth = new Date(year, month, 0).getDate()
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`

  let consultationsQuery = supabase
    .from('consultations')
    .select('date, amount, status_after_fv')
    .gte('date', startDate)
    .lte('date', endDate)
    .in('status_after_fv', ['Купила', 'Предоплата'])
    .is('deleted_at', null)

  if (employeeId) {
    consultationsQuery = consultationsQuery.eq('manager_id', employeeId)
  }

  let activityQuery = supabase
    .from('daily_activity')
    .select('date, revenue_fact')
    .gte('date', startDate)
    .lte('date', endDate)

  if (employeeId) {
    activityQuery = activityQuery.eq('employee_id', employeeId)
  }

  const [{ data: consults }, { data: activity }] = await Promise.all([consultationsQuery, activityQuery])
  console.log(`[revenueByWeeks] ${Date.now() - t0}ms`)

  // Группируем по неделям (1–7, 8–14, 15–21, 22–end)
  const weeks: WeekRevenuePoint[] = [
    { week: '1', label: '1–7', revenue: 0 },
    { week: '2', label: '8–14', revenue: 0 },
    { week: '3', label: '15–21', revenue: 0 },
    { week: '4', label: `22–${daysInMonth}`, revenue: 0 },
  ]

  const revenueByDay = new Map<string, number>()
  for (const consultation of consults ?? []) {
    revenueByDay.set(consultation.date as string, (revenueByDay.get(consultation.date as string) ?? 0) + (Number(consultation.amount) || 0))
  }
  for (const row of activity ?? []) {
    if (row.revenue_fact !== null) revenueByDay.set(row.date as string, Number(row.revenue_fact) || 0)
  }

  for (const [date, revenue] of revenueByDay) {
    const day = Number(date.slice(-2))
    if (day <= 7) weeks[0].revenue += revenue
    else if (day <= 14) weeks[1].revenue += revenue
    else if (day <= 21) weeks[2].revenue += revenue
    else weeks[3].revenue += revenue
  }

  return weeks
}

// ─────────────────────────────────────────────
// Таблица план vs факт по сотрудникам
// ─────────────────────────────────────────────

export async function getPlanVsFactTable(
  supabase: SupabaseClient,
  year: number,
  month: number,
  employeeId?: string
): Promise<PlanVsFactRow[]> {
  const t0 = Date.now()
  let query = supabase
    .from('sales_plan_weekly')
    .select(`
      employee_id,
      total_fv_plan, total_fv_fact,
      total_sales_plan, total_sales_fact,
      total_revenue_fact,
      kpi_pct,
      employees!inner(name)
    `)
    .eq('period_year', year)
    .eq('period_month', month)

  if (employeeId) {
    query = query.eq('employee_id', employeeId)
  }

  const { data: rows } = await query
  console.log(`[planVsFact] ${Date.now() - t0}ms`)

  if (!rows || rows.length === 0) return []

  return rows.map((row) => ({
    employee_id: row.employee_id as string,
    employee_name: (row.employees as unknown as { name: string }).name,
    plan_fv: Number(row.total_fv_plan) || 0,
    fact_fv: Number(row.total_fv_fact) || 0,
    plan_sales: Number(row.total_sales_plan) || 0,
    fact_sales: Number(row.total_sales_fact) || 0,
    revenue: Number(row.total_revenue_fact) || 0,
    kpi_pct: Math.round((Number(row.kpi_pct) || 0) * 10) / 10,
  }))
}

// ─────────────────────────────────────────────
// Статистика за сегодня (Today Cards)
// ─────────────────────────────────────────────

export async function getTodayStats(
  supabase: SupabaseClient,
  dateStr: string,
  employeeId?: string
): Promise<DashboardTodayStats> {
  const t0 = Date.now()
  let consultationsQuery = supabase
    .from('consultations')
    .select('status_after_fv, actual_status, amount')
    .eq('date', dateStr)
    .is('deleted_at', null)

  if (employeeId) {
    consultationsQuery = consultationsQuery.eq('manager_id', employeeId)
  }

  let activityQuery = supabase
    .from('daily_activity')
    .select('fv_fact, sales_fact, revenue_fact')
    .eq('date', dateStr)

  if (employeeId) {
    activityQuery = activityQuery.eq('employee_id', employeeId)
  }

  const [{ data: consults }, { data: activity }] = await Promise.all([consultationsQuery, activityQuery])
  console.log(`[todayStats] ${Date.now() - t0}ms`)

  const fv_today = consults?.filter(c =>
    c.actual_status !== null
  ).length ?? 0

  const sales_today = consults?.filter(c =>
    c.status_after_fv === 'Купила' || c.status_after_fv === 'Предоплата'
  ).length ?? 0

  const revenue_today = consults?.reduce((sum, c) => {
    if (c.status_after_fv === 'Купила' || c.status_after_fv === 'Предоплата') {
      return sum + (Number(c.amount) || 0)
    }
    return sum
  }, 0) ?? 0

  const hasActivity = (activity ?? []).some((row) => row.fv_fact !== null || row.sales_fact !== null || row.revenue_fact !== null)
  if (!hasActivity) return { fv_today, sales_today, revenue_today }

  return (activity ?? []).reduce((total, row) => ({
    fv_today: total.fv_today + (Number(row.fv_fact) || 0),
    sales_today: total.sales_today + (Number(row.sales_fact) || 0),
    revenue_today: total.revenue_today + (Number(row.revenue_fact) || 0),
  }), { fv_today: 0, sales_today: 0, revenue_today: 0 })
}

// ─────────────────────────────────────────────
// Лента событий (Live Feed)
// ─────────────────────────────────────────────

export async function getLiveFeed(
  supabase: SupabaseClient,
  dateStr: string,
  employeeId?: string,
  limit = 20
): Promise<LiveFeedItem[]> {
  const t0 = Date.now()
  let query = supabase
    .from('consultations')
    .select(`
      id, time, client_name, status_after_fv, actual_status, status, amount, is_nv,
      employees!consultations_manager_id_fkey(name)
    `)
    .eq('date', dateStr)
    .is('deleted_at', null)
    .order('time', { ascending: false })
    .limit(limit)

  if (employeeId) {
    query = query.eq('manager_id', employeeId)
  }

  const { data: rows } = await query
  console.log(`[liveFeed] ${Date.now() - t0}ms`)

  if (!rows || rows.length === 0) return []

  // ТЕХНИЧЕСКИЙ ДОЛГ: тип employees из Supabase join — массив, приводим через unknown
  return rows.map(row => ({
    id: row.id as string,
    time: (row.time as string | null) ?? '00:00',
    client_name: row.client_name as string,
    manager_name: (row.employees as unknown as { name: string } | null)?.name ?? 'Неизвестно',
    status: (row.status_after_fv ?? row.actual_status ?? row.status) as LiveFeedItem['status'],
    amount: Number(row.amount) || 0,
    is_nv: Boolean(row.is_nv),
  }))
}

// ─────────────────────────────────────────────
// Команда сейчас (Team Now)
// ─────────────────────────────────────────────

export async function getTeamNow(
  supabase: SupabaseClient,
  dateStr: string,
  departmentId?: string
): Promise<TeamMemberStatus[]> {
  const t0 = Date.now()
  let empQuery = supabase
    .from('employees')
    .select('id, name, avatar_url, role')
    .eq('status', 'active')
    .is('deleted_at', null)
    .not('role', 'eq', 'owner')

  if (departmentId) {
    empQuery = empQuery.eq('department_id', departmentId)
  }

  const { data: employees } = await empQuery
  console.log(`[teamNow] employees: ${Date.now() - t0}ms`)

  if (!employees || employees.length === 0) return []

  const employeeIds = employees.map(e => e.id as string)

  const { data: attendanceRows } = await supabase
    .from('attendance')
    .select('employee_id, status')
    .eq('date', dateStr)
    .in('employee_id', employeeIds)
  console.log(`[teamNow] attendance: ${Date.now() - t0}ms`)

  const attendanceMap = new Map<string, AttendanceStatus>()
  for (const row of attendanceRows ?? []) {
    attendanceMap.set(row.employee_id as string, row.status as AttendanceStatus)
  }

  // Считаем продажи сегодня
  const { data: todaySales } = await supabase
    .from('consultations')
    .select('manager_id, status_after_fv, actual_status, amount')
    .eq('date', dateStr)
    .in('manager_id', employeeIds)
    .is('deleted_at', null)
  console.log(`[teamNow] todaySales: ${Date.now() - t0}ms`)

  const salesMap = new Map<string, { fv: number; sales: number }>()
  for (const c of todaySales ?? []) {
    const mid = c.manager_id as string
    const entry = salesMap.get(mid) ?? { fv: 0, sales: 0 }
    if (c.actual_status !== null) entry.fv += 1
    if (c.status_after_fv === 'Купила' || c.status_after_fv === 'Предоплата') entry.sales += 1
    salesMap.set(mid, entry)
  }

  return employees.map(emp => ({
    id: emp.id as string,
    name: emp.name as string,
    avatar_url: emp.avatar_url as string | null,
    role: emp.role as UserRole,
    attendance_status: attendanceMap.get(emp.id as string) ?? null,
    fv_today: salesMap.get(emp.id as string)?.fv ?? 0,
    sales_today: salesMap.get(emp.id as string)?.sales ?? 0,
  }))
}

// ─────────────────────────────────────────────
// Расписание на сегодня
// ─────────────────────────────────────────────

export interface ScheduleItem {
  id: string
  time: string
  client_name: string
  status: string | null
  actual_status: string | null
  status_after_fv: string | null
  manager_name: string
  amount: number
  is_nv: boolean
  isPast: boolean
}

export async function getTodaySchedule(
  supabase: SupabaseClient,
  dateStr: string,
  employeeId?: string
): Promise<ScheduleItem[]> {
  const t0 = Date.now()
  let query = supabase
    .from('consultations')
    .select(`
      id, time, client_name, status, actual_status, status_after_fv, amount, is_nv,
      employees!consultations_manager_id_fkey(name)
    `)
    .eq('date', dateStr)
    .is('deleted_at', null)
    .order('time', { ascending: true })

  if (employeeId) {
    query = query.eq('manager_id', employeeId)
  }

  const { data: rows } = await query
  console.log(`[todaySchedule] ${Date.now() - t0}ms`)

  if (!rows || rows.length === 0) return []

  const nowTime = new Date().toTimeString().substring(0, 5)

  // ТЕХНИЧЕСКИЙ ДОЛГ: тип employees из Supabase join — массив, приводим через unknown
  return rows.map(row => ({
    id: row.id as string,
    time: (row.time as string | null) ?? '00:00',
    client_name: row.client_name as string,
    status: row.status as string | null,
    actual_status: row.actual_status as string | null,
    status_after_fv: row.status_after_fv as string | null,
    manager_name: (row.employees as unknown as { name: string } | null)?.name ?? '',
    amount: Number(row.amount) || 0,
    is_nv: Boolean(row.is_nv),
    isPast: (row.time as string ?? '00:00') < nowTime,
  }))
}

// ─────────────────────────────────────────────
// Сводка по доске задач (блок «Менеджеру» на дашборде)
// ─────────────────────────────────────────────

export interface TaskBoardSummary {
  /** Всё, что не done. */
  active: number
  /** Срок прошёл, задача не закрыта. */
  overdue: number
  /** Срок — сегодня. */
  dueToday: number
  /** Назначено на текущего сотрудника и не закрыто. */
  mine: number
}

/**
 * Одним запросом: видимость задач фильтрует RLS (can_see_task), поэтому
 * дополнительных условий по роли здесь нет — считаем по тому, что вернулось.
 */
export async function getTaskSummary(
  supabase: SupabaseClient,
  dateStr: string,
  employeeId?: string
): Promise<TaskBoardSummary> {
  const { data: rows } = await supabase
    .from('tasks')
    .select('status, due_date, assignee_id')

  const summary: TaskBoardSummary = { active: 0, overdue: 0, dueToday: 0, mine: 0 }
  for (const row of rows ?? []) {
    if (row.status === 'done') continue
    summary.active += 1
    const due = row.due_date as string | null
    if (due && due < dateStr) summary.overdue += 1
    if (due === dateStr) summary.dueToday += 1
    if (employeeId && row.assignee_id === employeeId) summary.mine += 1
  }
  return summary
}

/**
 * Непрочитанные уведомления сотрудника.
 * Фильтр по employee_id обязателен: у owner политика notifications_select_owner
 * открывает чужие уведомления, и без него счётчик был бы «по всей компании».
 */
export async function getUnreadNotificationsCount(
  supabase: SupabaseClient,
  employeeId?: string
): Promise<number> {
  if (!employeeId) return 0
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('employee_id', employeeId)
    .eq('is_read', false)
  return count ?? 0
}

'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { AuditAction, AuditRow } from '@/lib/audit-format'

// audit_logs (миграция 015) — append-only лог изменений. Триггер
// notify_from_audit_log (миграция 031) сам создаёт уведомление на каждую запись
// create/update/delete, поэтому здесь достаточно просто записать факт.

/**
 * Записывает изменение в audit_logs. Никогда не бросает: сбой аудита не должен
 * ломать саму мутацию, ради которой он вызван. Человекочитаемый текст кладём в
 * new_data.summary — в таблице нет отдельной колонки под заголовок.
 */
export async function recordAudit(input: {
  action: AuditAction
  resourceType: string
  resourceId?: string | null
  summary: string
}): Promise<void> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const admin = createAdminClient()
    const { data: employee } = await admin
      .from('employees')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()

    await admin.from('audit_logs').insert({
      employee_id: employee?.id ?? null,
      action: input.action,
      resource_type: input.resourceType,
      resource_id: input.resourceId ?? null,
      new_data: { summary: input.summary },
    })
  } catch (e) {
    console.error('[recordAudit]', e)
  }
}

/**
 * Последние изменения для панели «Последние действия». RLS (audit_logs_select_owner)
 * отдаёт строки только владельцу — у остальных ролей список будет пустым.
 */
export async function getAuditLog(limit = 15): Promise<AuditRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('audit_logs')
    .select('id, action, resource_type, new_data, created_at, employees(name)')
    .in('action', ['create', 'update', 'delete'])
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error || !data) return []

  return data.map((row) => {
    const emp = row.employees as unknown as { name: string } | { name: string }[] | null
    const employeeName = Array.isArray(emp) ? (emp[0]?.name ?? null) : (emp?.name ?? null)
    const nd = row.new_data as { summary?: string } | null
    return {
      id: row.id as string,
      action: row.action as AuditAction,
      resourceType: row.resource_type as string,
      summary: nd?.summary ?? '',
      employeeName,
      createdAt: row.created_at as string,
    }
  })
}

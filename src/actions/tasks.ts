'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  TaskStatus,
  TaskWithRelations,
  TaskEmployee,
  TaskViewer,
} from '@/types'

// ─── Результат действия ──────────────────────────────────────────────────────

export type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; error: string }

// ─── Текущий сотрудник ───────────────────────────────────────────────────────

async function getViewer(): Promise<TaskViewer | null> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null

  const { data } = await supabase
    .from('employees')
    .select('id, role, department_id, name')
    .eq('user_id', session.user.id)
    .is('deleted_at', null)
    .maybeSingle()

  return (data as TaskViewer | null) ?? null
}

// ─── Данные для доски ────────────────────────────────────────────────────────

export interface TasksData {
  tasks: TaskWithRelations[]
  employees: TaskEmployee[]
  departments: { id: string; name: string }[]
  me: TaskViewer | null
}

export async function getTasksData(): Promise<TasksData> {
  const me = await getViewer()
  if (!me) return { tasks: [], employees: [], departments: [], me: null }

  const supabase = await createClient()
  const admin = createAdminClient()

  // tasks/task_members — через RLS-клиент: видимость применяется в БД.
  // employees/departments — через admin: имена нужны для пикеров и аватаров.
  const [{ data: tasks }, { data: members }, { data: emps }, { data: depts }] =
    await Promise.all([
      supabase
        .from('tasks')
        .select('*')
        .order('position', { ascending: true })
        .order('created_at', { ascending: false }),
      supabase.from('task_members').select('task_id, employee_id'),
      admin
        .from('employees')
        .select('id, name, role, department_id, avatar_url')
        .is('deleted_at', null)
        .order('name'),
      admin
        .from('departments')
        .select('id, name')
        .eq('is_active', true)
        .order('name'),
    ])

  const membersByTask = new Map<string, string[]>()
  for (const m of (members ?? []) as { task_id: string; employee_id: string }[]) {
    const arr = membersByTask.get(m.task_id) ?? []
    arr.push(m.employee_id)
    membersByTask.set(m.task_id, arr)
  }

  const withRel: TaskWithRelations[] = ((tasks ?? []) as TaskWithRelations[]).map(
    (t) => ({ ...t, members: membersByTask.get(t.id) ?? [] })
  )

  return {
    tasks: withRel,
    employees: (emps ?? []) as TaskEmployee[],
    departments: (depts ?? []) as { id: string; name: string }[],
    me,
  }
}

// ─── Схема формы ─────────────────────────────────────────────────────────────

const TaskSchema = z.object({
  title: z.string().trim().min(1, 'Название обязательно').max(300, 'Слишком длинное название'),
  description: z.string().nullable().optional(),
  status: z.enum(['todo', 'in_progress', 'review', 'done']).default('todo'),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  visibility: z.enum(['all', 'department', 'private']).default('all'),
  assignee_id: z.string().uuid().nullable().optional(),
  department_id: z.string().uuid().nullable().optional(),
  due_date: z.string().nullable().optional(),
  member_ids: z.array(z.string().uuid()).default([]),
})

export type TaskFormData = z.input<typeof TaskSchema>

// ─── Создание ────────────────────────────────────────────────────────────────

export async function createTask(input: TaskFormData): Promise<ActionResult<{ id: string }>> {
  const me = await getViewer()
  if (!me) return { success: false, error: 'Нет авторизации' }

  const parsed = TaskSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Ошибка валидации' }
  }
  const d = parsed.data
  const supabase = await createClient()

  // Для видимости «отдел» привязываем задачу к отделу (по умолчанию — отдел автора).
  const department_id =
    d.visibility === 'department' ? (d.department_id ?? me.department_id ?? null) : null

  // Позиция — в конец выбранной колонки.
  const { data: last } = await supabase
    .from('tasks')
    .select('position')
    .eq('status', d.status)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()
  const position = ((last?.position as number | undefined) ?? -1) + 1

  const { data: created, error } = await supabase
    .from('tasks')
    .insert({
      title: d.title,
      description: d.description?.trim() || null,
      status: d.status,
      priority: d.priority,
      visibility: d.visibility,
      assignee_id: d.assignee_id ?? null,
      department_id,
      due_date: d.due_date || null,
      created_by: me.id,
      position,
    })
    .select('id')
    .single()

  if (error || !created) return { success: false, error: error?.message ?? 'Не удалось создать задачу' }

  if (d.visibility === 'private' && d.member_ids.length) {
    const rows = d.member_ids
      .filter((id) => id !== me.id && id !== d.assignee_id)
      .map((employee_id) => ({ task_id: created.id, employee_id }))
    if (rows.length) await supabase.from('task_members').insert(rows)
  }

  revalidatePath('/dashboard/tasks')
  return { success: true, data: { id: created.id } }
}

// ─── Редактирование ──────────────────────────────────────────────────────────

export async function updateTask(id: string, input: TaskFormData): Promise<ActionResult> {
  const me = await getViewer()
  if (!me) return { success: false, error: 'Нет авторизации' }

  const parsed = TaskSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Ошибка валидации' }
  }
  const d = parsed.data
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('tasks')
    .select('created_by, visibility')
    .eq('id', id)
    .maybeSingle()
  if (!existing) return { success: false, error: 'Задача не найдена или недоступна' }

  // Видимость и состав участников меняет только автор или owner.
  const canManage = me.role === 'owner' || existing.created_by === me.id
  const visibility = canManage ? d.visibility : (existing.visibility as typeof d.visibility)
  const department_id =
    visibility === 'department' ? (d.department_id ?? me.department_id ?? null) : null

  const { data: updated, error } = await supabase
    .from('tasks')
    .update({
      title: d.title,
      description: d.description?.trim() || null,
      status: d.status,
      priority: d.priority,
      assignee_id: d.assignee_id ?? null,
      due_date: d.due_date || null,
      visibility,
      department_id,
    })
    .eq('id', id)
    .select('id')

  if (error) return { success: false, error: error.message }
  if (!updated || updated.length === 0) return { success: false, error: 'Недостаточно прав' }

  if (canManage) {
    await supabase.from('task_members').delete().eq('task_id', id)
    if (visibility === 'private' && d.member_ids.length) {
      const rows = d.member_ids
        .filter((mid) => mid !== me.id && mid !== d.assignee_id)
        .map((employee_id) => ({ task_id: id, employee_id }))
      if (rows.length) await supabase.from('task_members').insert(rows)
    }
  }

  revalidatePath('/dashboard/tasks')
  return { success: true }
}

// ─── Перемещение / переупорядочивание ────────────────────────────────────────

export async function moveTask(
  taskId: string,
  toStatus: TaskStatus,
  orderedIds: string[]
): Promise<ActionResult> {
  const me = await getViewer()
  if (!me) return { success: false, error: 'Нет авторизации' }

  const supabase = await createClient()

  const { data: moved, error } = await supabase
    .from('tasks')
    .update({ status: toStatus })
    .eq('id', taskId)
    .select('id')
  if (error) return { success: false, error: error.message }
  if (!moved || moved.length === 0) return { success: false, error: 'Недостаточно прав' }

  // Пересобираем позиции в целевой колонке.
  await Promise.all(
    orderedIds.map((id, idx) =>
      supabase.from('tasks').update({ position: idx }).eq('id', id)
    )
  )

  revalidatePath('/dashboard/tasks')
  return { success: true }
}

// ─── Удаление ────────────────────────────────────────────────────────────────

export async function deleteTask(id: string): Promise<ActionResult> {
  const me = await getViewer()
  if (!me) return { success: false, error: 'Нет авторизации' }

  const supabase = await createClient()
  const { data, error } = await supabase.from('tasks').delete().eq('id', id).select('id')
  if (error) return { success: false, error: error.message }
  if (!data || data.length === 0) {
    return { success: false, error: 'Удалять задачу может только автор или владелец' }
  }

  revalidatePath('/dashboard/tasks')
  return { success: true }
}

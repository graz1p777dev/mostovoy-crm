'use client'

import { useMemo, useState, useTransition } from 'react'
import { X, Trash2, Check } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'
import Modal from '../Modal'
import { cn } from '@/lib/utils'
import { getInitials } from '@/lib/formatters'
import { createTask, updateTask, deleteTask } from '@/actions/tasks'
import type {
  TaskWithRelations,
  TaskEmployee,
  TaskStatus,
  TaskPriority,
  TaskVisibility,
  TaskViewer,
} from '@/types'
import {
  TASK_COLUMNS,
  TASK_PRIORITY,
  TASK_PRIORITY_ORDER,
  TASK_VISIBILITY,
  TASK_VISIBILITY_ORDER,
} from './task-config'

interface Props {
  task: TaskWithRelations | null
  isNew: boolean
  defaultStatus?: TaskStatus
  employees: TaskEmployee[]
  departments: { id: string; name: string }[]
  me: TaskViewer
  onClose: () => void
  onSaved: () => void
}

interface FormState {
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  visibility: TaskVisibility
  assignee_id: string
  department_id: string
  due_date: string
  member_ids: string[]
}

export default function TaskModal({
  task,
  isNew,
  defaultStatus,
  employees,
  departments,
  me,
  onClose,
  onSaved,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [isDeleting, setIsDeleting] = useState(false)
  const [memberQuery, setMemberQuery] = useState('')

  // Видимость и участников меняет только автор или владелец.
  const canManage = isNew || me.role === 'owner' || task?.created_by === me.id
  const canDelete = !isNew && (me.role === 'owner' || task?.created_by === me.id)

  const [form, setForm] = useState<FormState>(() => ({
    title: task?.title ?? '',
    description: task?.description ?? '',
    status: task?.status ?? defaultStatus ?? 'todo',
    priority: task?.priority ?? 'medium',
    visibility: task?.visibility ?? 'all',
    assignee_id: task?.assignee_id ?? '',
    department_id: task?.department_id ?? me.department_id ?? '',
    due_date: task?.due_date ?? '',
    member_ids: task?.members ?? [],
  }))

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  const filteredMembers = useMemo(() => {
    const q = memberQuery.trim().toLowerCase()
    return employees
      .filter((e) => e.id !== form.assignee_id) // исполнитель и так видит задачу
      .filter((e) => (q ? e.name.toLowerCase().includes(q) : true))
  }, [employees, memberQuery, form.assignee_id])

  const selectedAssignee = employees.find((employee) => employee.id === form.assignee_id)

  const toggleMember = (id: string) =>
    set(
      'member_ids',
      form.member_ids.includes(id)
        ? form.member_ids.filter((m) => m !== id)
        : [...form.member_ids, id]
    )

  const handleSave = () => {
    if (!form.title.trim()) {
      toast.error('Введите название задачи')
      return
    }
    const payload = {
      title: form.title,
      description: form.description || null,
      status: form.status,
      priority: form.priority,
      visibility: form.visibility,
      assignee_id: form.assignee_id || null,
      department_id: form.visibility === 'department' ? form.department_id || null : null,
      due_date: form.due_date || null,
      member_ids: form.visibility === 'private' ? form.member_ids : [],
    }
    startTransition(async () => {
      const res = isNew
        ? await createTask(payload)
        : await updateTask(task!.id, payload)
      if (res.success) {
        toast.success(isNew ? 'Задача создана' : 'Изменения сохранены')
        onSaved()
        onClose()
      } else {
        toast.error(res.error)
      }
    })
  }

  const handleDelete = () => {
    if (!task) return
    startTransition(async () => {
      const res = await deleteTask(task.id)
      if (res.success) {
        toast.success('Задача удалена')
        onSaved()
        onClose()
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <Modal onClose={onClose}>
      <div className="flex max-h-[88vh] w-[min(560px,92vw)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Шапка */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-bold text-gray-900">
            {isNew ? 'Новая задача' : 'Задача'}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={18} />
          </button>
        </div>

        {/* Тело */}
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5 scroll-hidden">
          <div className="space-y-1.5">
            <Label>Название</Label>
            <Input
              autoFocus
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="Что нужно сделать?"
              maxLength={300}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Описание</Label>
            <Textarea
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Детали, ссылки, критерии готовности…"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Этап</Label>
              <Select value={form.status} onValueChange={(v) => set('status', v as TaskStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TASK_COLUMNS.map((c) => (
                    <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Приоритет</Label>
              <Select value={form.priority} onValueChange={(v) => set('priority', v as TaskPriority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TASK_PRIORITY_ORDER.map((p) => (
                    <SelectItem key={p} value={p}>{TASK_PRIORITY[p].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Исполнитель</Label>
              <Select
                value={form.assignee_id || 'none'}
                onValueChange={(v) => set('assignee_id', v && v !== 'none' ? v : '')}
              >
                <SelectTrigger>
                  <SelectValue>{selectedAssignee?.name ?? 'Без исполнителя'}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Без исполнителя</SelectItem>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Срок</Label>
              <Input
                type="date"
                value={form.due_date}
                onChange={(e) => set('due_date', e.target.value)}
              />
            </div>
          </div>

          {/* Видимость */}
          <div className="space-y-1.5">
            <Label>Видимость</Label>
            <div className="grid grid-cols-3 gap-2">
              {TASK_VISIBILITY_ORDER.map((v) => {
                const cfg = TASK_VISIBILITY[v]
                const Icon = cfg.icon
                const active = form.visibility === v
                return (
                  <button
                    key={v}
                    type="button"
                    disabled={!canManage}
                    onClick={() => set('visibility', v)}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-[11px] font-medium transition-all',
                      active
                        ? 'border-transparent text-white brand-gradient shadow-sm'
                        : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50',
                      !canManage && 'cursor-not-allowed opacity-60'
                    )}
                  >
                    <Icon size={16} />
                    {cfg.label}
                  </button>
                )
              })}
            </div>
            {!canManage && (
              <p className="text-[11px] text-gray-400">
                Видимость может менять только автор задачи или владелец.
              </p>
            )}
          </div>

          {/* Отдел — для видимости «отдел» */}
          {form.visibility === 'department' && canManage && (
            <div className="space-y-1.5">
              <Label>Отдел</Label>
              <Select
                value={form.department_id || 'none'}
                onValueChange={(v) => set('department_id', v && v !== 'none' ? v : '')}
              >
                <SelectTrigger><SelectValue placeholder="Выберите отдел" /></SelectTrigger>
                <SelectContent>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Участники — для приватной задачи */}
          {form.visibility === 'private' && canManage && (
            <div className="space-y-1.5">
              <Label>Кто ещё видит задачу</Label>
              <Input
                value={memberQuery}
                onChange={(e) => setMemberQuery(e.target.value)}
                placeholder="Поиск сотрудника…"
              />
              <div className="max-h-44 space-y-0.5 overflow-y-auto rounded-xl border border-gray-100 p-1 scroll-hidden">
                {filteredMembers.length === 0 && (
                  <p className="px-2 py-3 text-center text-[12px] text-gray-400">Никого не найдено</p>
                )}
                {filteredMembers.map((e) => {
                  const checked = form.member_ids.includes(e.id)
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => toggleMember(e.id)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors',
                        checked ? 'bg-[var(--brand-soft)]' : 'hover:bg-gray-50'
                      )}
                    >
                      <div
                        className="flex h-6 w-6 items-center justify-center rounded-full text-white brand-gradient"
                        style={{ fontSize: 10, fontWeight: 600 }}
                      >
                        {getInitials(e.name)}
                      </div>
                      <span className="flex-1 truncate text-[12px] text-gray-700">{e.name}</span>
                      <span
                        className={cn(
                          'flex h-4 w-4 items-center justify-center rounded border',
                          checked ? 'border-transparent bg-[var(--brand)] text-white' : 'border-gray-300'
                        )}
                      >
                        {checked && <Check size={12} />}
                      </span>
                    </button>
                  )
                })}
              </div>
              <p className="text-[11px] text-gray-400">
                Автор и исполнитель видят задачу всегда.
              </p>
            </div>
          )}
        </div>

        {/* Низ */}
        <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4">
          {canDelete ? (
            isDeleting ? (
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-gray-500">Удалить?</span>
                <Button variant="destructive" size="sm" onClick={handleDelete} disabled={isPending}>
                  Да
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setIsDeleting(false)} disabled={isPending}>
                  Нет
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsDeleting(true)}
                disabled={isPending}
                className="text-red-500 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 size={15} className="mr-1" />
                Удалить
              </Button>
            )
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose} disabled={isPending}>
              Отмена
            </Button>
            <Button onClick={handleSave} disabled={isPending} className="brand-gradient text-white">
              {isPending ? 'Сохранение…' : isNew ? 'Создать' : 'Сохранить'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

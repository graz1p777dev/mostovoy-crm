'use client'

import { CalendarClock, GripVertical } from 'lucide-react'
import { getInitials } from '@/lib/formatters'
import { cn } from '@/lib/utils'
import type { TaskWithRelations, TaskEmployee } from '@/types'
import { TASK_PRIORITY, TASK_VISIBILITY } from './task-config'

interface Props {
  task: TaskWithRelations
  employees: Map<string, TaskEmployee>
  dragging: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onClick: () => void
}

function Avatar({ emp }: { emp: TaskEmployee | undefined }) {
  if (!emp) return null
  if (emp.avatar_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={emp.avatar_url}
        alt={emp.name}
        title={emp.name}
        className="h-6 w-6 rounded-full object-cover ring-2 ring-white"
      />
    )
  }
  return (
    <div
      title={emp.name}
      className="flex h-6 w-6 items-center justify-center rounded-full text-white ring-2 ring-white brand-gradient"
      style={{ fontSize: 10, fontWeight: 600 }}
    >
      {getInitials(emp.name)}
    </div>
  )
}

function formatDue(date: string): { label: string; overdue: boolean; soon: boolean } {
  const due = new Date(date + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86_400_000)
  const label = due.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
  return { label, overdue: diffDays < 0, soon: diffDays >= 0 && diffDays <= 2 }
}

export default function TaskCard({
  task,
  employees,
  dragging,
  onDragStart,
  onDragEnd,
  onClick,
}: Props) {
  const priority = TASK_PRIORITY[task.priority]
  const assignee = task.assignee_id ? employees.get(task.assignee_id) : undefined
  const Vis = TASK_VISIBILITY[task.visibility].icon
  const due = task.due_date ? formatDue(task.due_date) : null

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', task.id)
        onDragStart()
      }}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={cn(
        'group relative cursor-pointer select-none rounded-xl border border-gray-100 bg-white p-3 shadow-sm',
        'transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md hover:border-gray-200',
        dragging && 'opacity-40 rotate-[1.5deg]'
      )}
      style={{ borderLeft: `3px solid ${priority.color}` }}
    >
      {/* Хват для перетаскивания */}
      <div
        className="absolute right-1.5 top-2.5 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100"
        aria-hidden
      >
        <GripVertical size={14} />
      </div>

      {/* Заголовок */}
      <p className="pr-4 text-[13px] font-semibold leading-snug text-gray-800 line-clamp-2">
        {task.title}
      </p>

      {/* Описание */}
      {task.description && (
        <p className="mt-1 text-[12px] leading-snug text-gray-400 line-clamp-2">
          {task.description}
        </p>
      )}

      {/* Метки */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span
          className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
          style={{ color: priority.color, background: priority.bg }}
        >
          {priority.label}
        </span>
        {due && (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium',
              due.overdue
                ? 'bg-red-50 text-red-600'
                : due.soon
                  ? 'bg-amber-50 text-amber-700'
                  : 'bg-gray-100 text-gray-500'
            )}
          >
            <CalendarClock size={11} />
            {due.label}
          </span>
        )}
      </div>

      {/* Низ: видимость + исполнитель */}
      <div className="mt-2.5 flex items-center justify-between">
        <span
          className="inline-flex items-center gap-1 text-[10px] text-gray-400"
          title={TASK_VISIBILITY[task.visibility].hint}
        >
          <Vis size={12} />
          {TASK_VISIBILITY[task.visibility].label}
        </span>
        {assignee ? (
          <Avatar emp={assignee} />
        ) : (
          <span className="text-[10px] text-gray-300">без исполнителя</span>
        )}
      </div>
    </div>
  )
}

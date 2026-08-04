import { Mail, Phone, Calendar, Briefcase, Building2, CalendarClock, UserRound, StickyNote } from 'lucide-react'
import { formatTenureLong } from '@/lib/employee-tenure'
import { Panel, InfoRow, BRAND, fmtDate } from './shared'

export interface OverviewEmployee {
  name: string
  email: string
  phone: string | null
  role: string
  roleLabel: string
  status: string
  hire_date: string | null
  birth_date: string | null
  schedule_type: string
  work_start_time: string | null
  work_end_time: string | null
  notes: string | null
  dismissal_reason: string | null
  deleted_at: string | null
  deptName: string | null
}

/** canSeePersonal — право на персональные/кадровые данные (в системе это salaries.view
 *  с учётом охвата, см. page.tsx). Без него телефон, дата рождения, заметки и причина
 *  увольнения не приходят с сервера вообще — здесь их просто нечего рендерить,
 *  и мы не показываем даже пустые строки, чтобы не намекать на скрытое содержимое. */
export function OverviewTab({ emp, canSeePersonal }: {
  emp: OverviewEmployee
  canSeePersonal: boolean
}) {
  const isDismissed = emp.status === 'archived' || emp.deleted_at !== null
  const schedule = [
    emp.schedule_type,
    emp.work_start_time && emp.work_end_time
      ? `${emp.work_start_time.slice(0, 5)}–${emp.work_end_time.slice(0, 5)}`
      : null,
  ].filter(Boolean).join(' · ')

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Panel title="Контакты" icon={<UserRound size={16} />}>
        <div className="space-y-3">
          <InfoRow icon={<Mail size={14} />} label="Email" value={emp.email} />
          {canSeePersonal && (
            <>
              <InfoRow icon={<Phone size={14} />} label="Телефон" value={emp.phone || '—'} />
              <InfoRow icon={<Calendar size={14} />} label="Дата рождения" value={fmtDate(emp.birth_date)} />
            </>
          )}
        </div>
      </Panel>

      <Panel title="Работа" icon={<Briefcase size={16} />}>
        <div className="space-y-3">
          <InfoRow icon={<UserRound size={14} />} label="Роль"  value={emp.roleLabel} />
          <InfoRow icon={<Building2 size={14} />} label="Отдел" value={emp.deptName || '—'} />
          <InfoRow
            icon={<CalendarClock size={14} />}
            label="Дата приёма"
            value={fmtDate(emp.hire_date)}
            // Стаж — производная от даты приёма, показываем подписью под ней.
            hint={emp.hire_date ? formatTenureLong(emp.hire_date) : undefined}
          />
          <InfoRow icon={<Briefcase size={14} />} label="График работы" value={schedule || '—'} />
        </div>
      </Panel>

      {/* Блок увольнения — только для архивных. Дата увольнения видна всем, кто видит
          карточку; формулировка причины — кадровая чувствительная информация. */}
      {isDismissed && (
        <Panel title="Увольнение" icon={<CalendarClock size={16} />}>
          <div className="space-y-3">
            <InfoRow label="Дата увольнения" value={fmtDate(emp.deleted_at)} />
            {canSeePersonal && (
              <InfoRow label="Причина" value={emp.dismissal_reason?.trim() || 'не указана'} />
            )}
          </div>
        </Panel>
      )}

      {canSeePersonal && emp.notes && (
        <Panel title="Служебные заметки" icon={<StickyNote size={16} />}>
          <p className="text-sm whitespace-pre-wrap break-words" style={{ color: BRAND.text }}>
            {emp.notes}
          </p>
        </Panel>
      )}
    </div>
  )
}

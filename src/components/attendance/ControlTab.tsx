'use client'

// ─── Вкладка «Контроль» — счётчики по сотрудникам ─────────────────────────────
//
// Экран невидим сотруднику НЕ за счёт скрытия пункта меню: действие
// getAttendanceSummary опирается на функцию БД, которая проверяет область прав
// актора и возвращает пусто всем, кроме ролей с областью team/all. Даже прямой
// вызов действия ничего не покажет.
//
// Приближение к порогу подсвечивается заранее: с 80 % порога — предупреждение,
// на пороге и выше — тревога. Владелец должен видеть проблему до срабатывания,
// а не в момент, когда уже поздно.

import { useCallback, useEffect, useState } from 'react'
import { ShieldOff, Users } from 'lucide-react'
import { getAttendanceSummary, type AttendanceSummaryRow } from '@/actions/attendance'
import { ATTENDANCE_THRESHOLDS } from '@/lib/attendance-rules'
import EmptyState from '@/components/common/EmptyState'
import PageLoader from '@/components/common/PageLoader'

type Level = 'ok' | 'warn' | 'alert'

function level(value: number, threshold: number): Level {
  if (value >= threshold) return 'alert'
  if (value >= Math.ceil(threshold * 0.8)) return 'warn'
  return 'ok'
}

const LEVEL_STYLE: Record<Level, React.CSSProperties> = {
  ok:    { color: 'var(--ink-2)' },
  warn:  { color: 'var(--warn-strong)', fontWeight: 700 },
  alert: { color: 'var(--brand-ink)', fontWeight: 700 },
}

function Counter({ value, threshold }: { value: number; threshold: number }) {
  const lv = level(value, threshold)
  return (
    <span style={LEVEL_STYLE[lv]}>
      {value}
      <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}> / {threshold}</span>
      {lv === 'alert' && <span title="Порог достигнут"> ⚠</span>}
    </span>
  )
}

function Plain({ value, danger }: { value: number; danger?: boolean }) {
  if (value === 0) return <span style={{ color: 'var(--ink-3)' }}>—</span>
  return <span style={{ color: danger ? 'var(--brand-ink)' : 'var(--ink-2)', fontWeight: danger ? 700 : 400 }}>{value}</span>
}

export default function ControlTab({ year, month }: { year: number; month: number }) {
  const [rows, setRows] = useState<AttendanceSummaryRow[]>([])
  const [denied, setDenied] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (y: number, m: number) => {
    setLoading(true)
    const res = await getAttendanceSummary(y, m)
    if (res.ok) { setRows(res.rows); setDenied(false) }
    else { setRows([]); setDenied(true) }
    setLoading(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(year, month)
  }, [load, year, month])

  if (loading) return <PageLoader minHeight="30vh" />

  // Два разных «пусто» больше не сливаются в одно уклончивое сообщение:
  // владельцу, у которого права есть, «либо у вас нет прав» читалось как
  // подозрение в отсутствии доступа.
  if (denied) {
    return (
      <EmptyState
        icon={ShieldOff}
        title="Нет доступа"
        hint="Контроль посещаемости доступен тем, кто ведёт учёт по отделу или по компании."
      />
    )
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="Нет сотрудников на учёте"
        hint="Учёт посещаемости включается на карточке сотрудника. Пока он никому не включён, контролировать нечего."
      />
    )
  }

  return (
    <div style={{ ...panel, padding: 0, overflow: 'hidden', overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '13px' }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left', minWidth: '190px' }}>Сотрудник</th>
            <th style={th} title="Опоздания 5–15 минут за текущий месяц. Порог — 5.">
              5–15<br /><span style={sub}>месяц</span>
            </th>
            <th style={th} title="Опоздания 5–15 минут за скользящие 3 месяца. Порог — 9. Ловит сброс счётчика на границе месяца.">
              5–15<br /><span style={sub}>3 мес.</span>
            </th>
            <th style={th} title="Опоздания свыше 15 минут за месяц, включая свыше 30. Порог — 3.">
              &gt;15<br /><span style={sub}>месяц</span>
            </th>
            <th style={th} title="Прогулы за месяц">Прогулы</th>
            <th style={th} title="Дни, где сотрудник не нажал «Закончить смену»">Не закрыто</th>
            <th style={th} title="Выход в нерабочий по графику день без отметки подмены — нарушение">Подмены<br /><span style={sub}>без отметки</span></th>
            <th style={th} title="Дней засчитано">Зачтено</th>
            <th style={th} title="Переработка за месяц, минут">Перераб.</th>
            <th style={th} title="Недоработка за месяц, минут">Недораб.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.employee_id}>
              <td style={tdName}>
                <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{r.employee_name}</div>
                <div style={{ fontSize: '11px', color: 'var(--ink-3)' }}>{r.role_label}</div>
              </td>
              <td style={td}><Counter value={r.soft_month} threshold={ATTENDANCE_THRESHOLDS.soft_month} /></td>
              <td style={td}><Counter value={r.soft_rolling3} threshold={ATTENDANCE_THRESHOLDS.soft_rolling3} /></td>
              <td style={td}><Counter value={r.hard_month} threshold={ATTENDANCE_THRESHOLDS.hard_month} /></td>
              <td style={td}><Plain value={r.absences_month} danger /></td>
              <td style={td}><Plain value={r.open_days_month} /></td>
              <td style={td}><Plain value={r.unmarked_subs} danger /></td>
              <td style={td}><Plain value={r.worked_days_month} /></td>
              <td style={td}><Plain value={r.overtime_month} /></td>
              <td style={td}><Plain value={r.shortfall_month} /></td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--line)', fontSize: '11.5px', color: 'var(--ink-3)' }}>
        Жирным оранжевым — приближение к порогу (от 80 %), красным с ⚠ — порог достигнут,
        сигнал уже отправлен в уведомления. Эти цифры сотрудник не видит.
      </div>
    </div>
  )
}

const panel: React.CSSProperties = {
  background: 'var(--surface)', borderRadius: '16px', padding: '22px 24px',
  border: '1px solid var(--line)', fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
}
const th: React.CSSProperties = {
  background: 'var(--surface-2)', color: 'var(--ink-3)', padding: '9px 10px',
  fontWeight: 600, fontSize: '11px', textAlign: 'center', lineHeight: 1.3,
  textTransform: 'uppercase', letterSpacing: '0.02em',
}
const sub: React.CSSProperties = { fontWeight: 400, opacity: 0.7, fontSize: '10px', textTransform: 'none' }
const td: React.CSSProperties = {
  padding: '11px 10px', textAlign: 'center', borderBottom: '1px solid var(--line)',
}
const tdName: React.CSSProperties = {
  padding: '10px 14px', borderBottom: '1px solid var(--line)', whiteSpace: 'nowrap',
}

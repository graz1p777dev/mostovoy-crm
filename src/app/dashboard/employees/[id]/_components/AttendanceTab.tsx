import { CalendarCheck, Clock } from 'lucide-react'
import { Panel, StatTile, EmptyHint, BRAND, fmtMonth } from './shared'

/** Строка журнала посещаемости (таблица attendance). */
export interface AttendanceRecord {
  date: string
  status: string
  is_late: boolean
  late_minutes: number | null
  check_in_time: string | null
  comment: string | null
}

const STATUS_LABELS: Record<string, { label: string; bg: string; color: string }> = {
  worked:   { label: 'Отработан',  bg: 'var(--ok-soft-alt)', color: 'var(--series-positive-text)' },
  remote:   { label: 'Удалённо',   bg: 'var(--info-soft)', color: 'var(--info)' },
  sick:     { label: 'Больничный', bg: 'var(--warn-soft-alt)', color: 'var(--warn-strong)' },
  vacation: { label: 'Отпуск',     bg: 'var(--surface-3)', color: 'var(--ink-2)' },
  day_off:  { label: 'Выходной',   bg: 'var(--surface-2)', color: 'var(--ink-3)' },
  absent:   { label: 'Отсутствие', bg: 'var(--brand-soft)', color: 'var(--brand-ink)' },
}

function fmtDay(iso: string): string {
  const p = iso.slice(0, 10).split('-')
  if (p.length !== 3) return iso
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]))
    .toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', weekday: 'short' })
}

function fmtTime(ts: string | null): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

export function AttendanceTab({ records, year, month }: {
  records: AttendanceRecord[]     // за текущий месяц, по убыванию даты
  year: number
  month: number
}) {
  const worked   = records.filter(r => r.status === 'worked' || r.status === 'remote').length
  const lates    = records.filter(r => r.is_late).length
  const absents  = records.filter(r => r.status === 'absent').length
  const sickDays = records.filter(r => r.status === 'sick').length
  const lateMinutesTotal = records.reduce((sum, r) => sum + (r.late_minutes ?? 0), 0)

  return (
    <div className="space-y-4">
      <Panel title={`Посещаемость — ${fmtMonth(year, month)}`} icon={<CalendarCheck size={16} />}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile label="Отработано дней" value={String(worked)} />
          <StatTile
            label="Опозданий"
            value={String(lates)}
            accent={lates > 0 ? 'var(--warn-strong)' : undefined}
            sub={lateMinutesTotal > 0 ? `${lateMinutesTotal} мин суммарно` : undefined}
          />
          <StatTile label="Отсутствий"  value={String(absents)} accent={absents > 0 ? 'var(--brand-ink)' : undefined} />
          <StatTile label="Больничных"  value={String(sickDays)} />
        </div>
      </Panel>

      <Panel title="Журнал дней" icon={<Clock size={16} />}>
        {records.length === 0 ? (
          <EmptyHint>За {fmtMonth(year, month)} отметок посещаемости нет</EmptyHint>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="w-full text-xs" style={{ minWidth: 480 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${BRAND.divider}` }}>
                  <th className="text-left py-2 pr-2 font-semibold" style={{ color: BRAND.muted }}>Дата</th>
                  <th className="text-left py-2 px-2 font-semibold" style={{ color: BRAND.muted }}>Статус</th>
                  <th className="text-left py-2 px-2 font-semibold" style={{ color: BRAND.muted }}>Приход</th>
                  <th className="text-left py-2 pl-2 font-semibold" style={{ color: BRAND.muted }}>Комментарий</th>
                </tr>
              </thead>
              <tbody>
                {records.map(r => {
                  const s = STATUS_LABELS[r.status] ?? { label: r.status, bg: BRAND.bg, color: BRAND.text }
                  return (
                    <tr key={r.date} style={{ borderBottom: `1px solid ${BRAND.divider}` }}>
                      <td className="py-2 pr-2 whitespace-nowrap" style={{ color: BRAND.text }}>{fmtDay(r.date)}</td>
                      <td className="py-2 px-2">
                        <span className="px-2 py-0.5 rounded-full font-medium whitespace-nowrap"
                          style={{ backgroundColor: s.bg, color: s.color }}>{s.label}</span>
                      </td>
                      <td className="py-2 px-2 whitespace-nowrap tabular-nums" style={{ color: BRAND.text }}>
                        {fmtTime(r.check_in_time)}
                        {r.is_late && (
                          <span className="ml-1.5 font-medium" style={{ color: 'var(--warn-strong)' }}>
                            +{r.late_minutes ?? 0} мин
                          </span>
                        )}
                      </td>
                      <td className="py-2 pl-2" style={{ color: BRAND.muted }}>{r.comment || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}

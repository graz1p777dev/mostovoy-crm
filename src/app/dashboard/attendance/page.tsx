'use client'

// ─── Экран «Посещаемость» ─────────────────────────────────────────────────────
//
// Правки против прежней версии (аудит 2026-07-29):
//   • день без записи больше не красится прогулом: «нет отметки», «ещё не принят»,
//     «выходной» и «будущее» — разные состояния с разным видом (7.5);
//   • при отсутствии доступа показывается внятный отказ, а не пустая таблица —
//     бухгалтер раньше видел «Нет сотрудников» и не понимал почему (7.2);
//   • роль больше не проверяется хардкодом на клиенте: решает сервер по правам,
//     поэтому кастомная роль с правом на посещаемость больше не блокируется;
//   • открытая смена (забыли нажать «Закончить») подсвечивается рамкой.

import { useCallback, useEffect, useState } from 'react'
import { ShieldOff, Users } from 'lucide-react'
import { getAttendanceReport, type AttendanceReport, type DayCellStatus } from '@/actions/attendance'
import CorrectionModal from '@/components/attendance/CorrectionModal'
import ControlTab from '@/components/attendance/ControlTab'
import VacationsTab from '@/components/attendance/VacationsTab'
import ExplanationsTab from '@/components/attendance/ExplanationsTab'
import EmptyState from '@/components/common/EmptyState'
import PageLoader from '@/components/common/PageLoader'

const RU_MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']
const DOW = ['вс','пн','вт','ср','чт','пт','сб']

// ─── Визуальная модель ячейки ─────────────────────────────────────────────────
//
// Три правила, из которых собран вид:
//
//  1. БУКВА НЕСЁТ СМЫСЛ САМА. В — вовремя, О — опоздание, П — прогул,
//     Н — день не зачтён, З — замена, Б — больничный/отпуск. Читается без
//     легенды; цвет только усиливает, а не является единственным носителем
//     информации.
//  2. НАПРАВЛЕНИЕ ЦВЕТА СОВПАДАЕТ СО СМЫСЛОМ. Хорошее — спокойный зелёный;
//     проблема — от песочного к красному по нарастанию; служебное — синий
//     из палитры; отсутствие данных — почти невидимое.
//  3. ОТКЛОНЕНИЕ ПО ВРЕМЕНИ — ОТДЕЛЬНОЕ ИЗМЕРЕНИЕ, полосой снизу: зелёная —
//     переработка (это хорошо), песочная — недоработка, пунктир — смена не
//     закрыта. Так «сколько отработал» не спорит с «как пришёл» за одну букву.
//
// Раньше все дни без записи показывали «?», и месяц читался как сплошная
// ошибка. Теперь «учёт не вёлся» — пустая нейтральная клетка, а «?» осталось
// только там, где учёт вёлся, а отметки нет.

// Моноширинный для сетки: буквы и минуты выстраиваются по колонкам, глаз
// сканирует месяц по вертикали. Тот же шрифт уже используется в проекте.
const MONO = "'IBM Plex Mono', ui-monospace, monospace"

interface Visual {
  bg: string
  fg: string
  glyph: string
  weight: number
}

function cellVisual(s: DayCellStatus): Visual {
  switch (s) {
    // хорошо
    case 'on_time':       return { bg: 'var(--ok-soft-alt)', fg: 'var(--series-positive-text)', glyph: 'В', weight: 600 }
    case 'late_forgiven': return { bg: 'var(--ok-soft-alt)', fg: 'var(--series-positive-text)', glyph: 'В', weight: 600 }
    // проблема, по нарастанию
    case 'late_soft':     return { bg: 'var(--warn-soft-alt)', fg: 'var(--warn-strong)', glyph: 'О', weight: 700 }
    case 'late_hard':     return { bg: 'var(--brand-soft)', fg: 'var(--series-negative-text)', glyph: 'О', weight: 700 }
    case 'late_critical': return { bg: 'var(--brand-soft)', fg: 'var(--brand-ink)', glyph: 'Н', weight: 800 }
    case 'absent':        return { bg: 'var(--brand-soft)', fg: 'var(--brand-ink)', glyph: 'П', weight: 800 }
    case 'no_record':     return { bg: 'var(--brand-soft)', fg: 'var(--brand-ink)', glyph: '?', weight: 700 }
    // служебное
    case 'substitute':    return { bg: 'var(--info-soft)', fg: 'var(--info)',    glyph: 'З', weight: 700 }
    case 'manual':        return { bg: 'var(--surface-2)', fg: 'var(--ink-2)', glyph: 'Б', weight: 600 }
    // нет данных — почти невидимо
    case 'off':           return { bg: 'var(--surface-2)', fg: 'var(--ink-4)', glyph: '·', weight: 400 }
    case 'not_tracked':   return { bg: 'var(--surface)', fg: 'var(--line)', glyph: '',  weight: 400 }
    case 'before_hire':   return { bg: 'var(--surface)', fg: 'var(--line)', glyph: '',  weight: 400 }
    case 'future':        return { bg: 'var(--surface)', fg: 'var(--line)', glyph: '',  weight: 400 }
  }
}

/** Итог месяца по сотруднику — чтобы «кто проблемный» читалось без счёта ячеек. */
function rowSummary(cells: { status: DayCellStatus }[]) {
  let late = 0, absent = 0, notCounted = 0
  for (const c of cells) {
    if (c.status === 'late_soft' || c.status === 'late_hard') late++
    else if (c.status === 'late_critical') notCounted++
    else if (c.status === 'absent') absent++
  }
  return { late, absent, notCounted, total: late + absent + notCounted }
}

/** Полоса снизу: отклонение по времени. Отдельно от «как пришёл». */
function deviationBar(c: { is_open: boolean; overtime_minutes: number; shortfall_minutes: number }): string {
  if (c.is_open) return '2px dashed var(--warn-strong)'
  if (c.overtime_minutes > 0) return '2px solid var(--series-positive-text)'
  if (c.shortfall_minutes > 0) return '2px solid var(--warn-strong)'
  return '2px solid transparent'
}

// Легенда сведена к пяти смысловым группам вместо семи почти одинаковых пастелей.
const LEGEND: { s: DayCellStatus; t: string }[] = [
  { s: 'on_time',       t: 'В — вовремя' },
  { s: 'late_soft',     t: 'О — опоздание' },
  { s: 'late_critical', t: 'Н — день не зачтён' },
  { s: 'absent',        t: 'П — прогул' },
  { s: 'substitute',    t: 'З — замена' },
]

export default function AttendancePage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [report, setReport] = useState<AttendanceReport | null>(null)
  const [denied, setDenied] = useState(false)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'sheet' | 'control' | 'vacations' | 'notes'>('sheet')
  // Правим только существующие записи: у дня без отметки править нечего.
  const [editingId, setEditingId] = useState<string | null>(null)

  const load = useCallback(async (y: number, m: number) => {
    setLoading(true)
    const res = await getAttendanceReport(y, m)
    if (res.ok) { setReport(res.report); setDenied(false) }
    else { setReport(null); setDenied(true) }
    setLoading(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(year, month)
  }, [load, year, month])

  const prevMonth = () => { if (month === 1) { setYear(y => y - 1); setMonth(12) } else setMonth(m => m - 1) }
  const nextMonth = () => { if (month === 12) { setYear(y => y + 1); setMonth(1) } else setMonth(m => m + 1) }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="kicker">Учёт рабочего времени</p>
          <h1 className="block-title span-rule mt-2">Посещаемость</h1>
          <p className="mt-2 max-w-xl text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
            Приход, опоздания и подмены сотрудников с графиком.
          </p>
        </div>
        <div
          className="flex items-center gap-1.5 rounded-xl px-2 py-1.5"
          style={{ border: '1px solid var(--line)', background: 'var(--surface)' }}
        >
          <button onClick={prevMonth} style={navBtn} aria-label="Предыдущий месяц">‹</button>
          <div style={{ color: 'var(--ink)', fontSize: '14px', fontWeight: 600, minWidth: '128px', textAlign: 'center' }}>
            {RU_MONTHS[month - 1]} {year}
          </div>
          <button onClick={nextMonth} style={navBtn} aria-label="Следующий месяц">›</button>
        </div>
      </header>

      {!denied && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <button onClick={() => setTab('sheet')} style={tab === 'sheet' ? tabActive : tabIdle}>Табель</button>
          <button onClick={() => setTab('control')} style={tab === 'control' ? tabActive : tabIdle}>Контроль</button>
          <button onClick={() => setTab('vacations')} style={tab === 'vacations' ? tabActive : tabIdle}>Отпуска</button>
          <button onClick={() => setTab('notes')} style={tab === 'notes' ? tabActive : tabIdle}>Объяснительные</button>
        </div>
      )}

      {!denied && tab === 'control' && <ControlTab year={year} month={month} />}
      {/* Своя проверка прав внутри: право «Отпуска» отдельное от «Посещаемости»,
          поэтому доступ к табелю ещё не даёт доступа к заявкам. */}
      {!denied && tab === 'vacations' && <VacationsTab />}
      {!denied && tab === 'notes' && <ExplanationsTab year={year} month={month} />}

      {denied && (
        <EmptyState
          icon={ShieldOff}
          title="Нет доступа к посещаемости"
          hint="Раздел доступен тем, кто ведёт учёт по отделу или по компании. Если доступ нужен — владелец выдаёт право на посещаемость в настройках ролей."
        />
      )}

      {!denied && tab === 'sheet' && (
        <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap', alignItems: 'center', padding: '0 4px' }}>
          {LEGEND.map(l => {
            const v = cellVisual(l.s)
            return (
              <div key={l.s} style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                <span style={{
                  width: '20px', height: '20px', borderRadius: '5px', background: v.bg, color: v.fg,
                  fontFamily: MONO, fontSize: '11px', fontWeight: v.weight,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}>{v.glyph}</span>
                <span style={{ fontSize: '12px', color: 'var(--ink-2)' }}>{l.t}</span>
              </div>
            )
          })}
          <span style={{ width: '1px', height: '16px', background: 'var(--line)' }} />
          <span style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
            <span style={{ width: '20px', height: '20px', borderRadius: '5px', background: 'var(--surface-2)', borderBottom: '2px solid var(--series-positive-text)' }} />
            <span style={{ fontSize: '12px', color: 'var(--ink-2)' }}>переработка</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
            <span style={{ width: '20px', height: '20px', borderRadius: '5px', background: 'var(--surface-2)', borderBottom: '2px solid var(--warn-strong)' }} />
            <span style={{ fontSize: '12px', color: 'var(--ink-2)' }}>недоработка</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
            <span style={{ width: '20px', height: '20px', borderRadius: '5px', background: 'var(--surface-2)', borderBottom: '2px dashed var(--warn-strong)' }} />
            <span style={{ fontSize: '12px', color: 'var(--ink-2)' }}>смена не закрыта</span>
          </span>
          <span style={{ fontSize: '11.5px', color: 'var(--ink-3)' }}>пустая клетка — учёт не вёлся или выходной</span>
        </div>
      )}

      {loading && !denied && tab === 'sheet' && <PageLoader minHeight="30vh" />}

      {!loading && !denied && tab === 'sheet' && report && report.rows.length === 0 && (
        <EmptyState
          icon={Users}
          title="Нет сотрудников на учёте"
          hint="Учёт посещаемости включается на карточке сотрудника. Пока он никому не включён, таблица пуста."
        />
      )}

      {!loading && !denied && tab === 'sheet' && report && report.rows.length > 0 && (
        <div style={{ ...panel, padding: 0, overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%' }}>
            <thead>
              <tr>
                <th style={{ ...thBase, position: 'sticky', left: 0, zIndex: 2, textAlign: 'left', minWidth: '190px' }}>Сотрудник</th>
                {Array.from({ length: report.days }, (_, i) => i + 1).map(d => {
                  const dow = new Date(report.year, report.month - 1, d).getDay()
                  return (
                    <th key={d} style={{ ...thBase, minWidth: '34px', color: dow === 0 || dow === 6 ? 'var(--ink-2)' : 'var(--ink-3)' }}>
                      <div style={{ fontSize: '12px', fontWeight: 700 }}>{d}</div>
                      <div style={{ fontSize: '9.5px', fontWeight: 500, opacity: 0.75 }}>{DOW[dow]}</div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {report.rows.map(r => (
                <tr key={r.employee_id}>
                  <td style={{ ...tdName, position: 'sticky', left: 0, zIndex: 1 }}>
                    <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--ink)' }}>{r.employee_name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--ink-3)' }}>{r.role_label}</div>
                    {(() => {
                      const sum = rowSummary(r.cells)
                      if (sum.total === 0) return null
                      return (
                        <div style={{ display: 'flex', gap: '7px', marginTop: '4px', fontFamily: MONO, fontSize: '10.5px', fontWeight: 700 }}>
                          {sum.late > 0 && <span style={{ color: 'var(--warn-strong)' }} title="Опозданий за месяц">О {sum.late}</span>}
                          {sum.notCounted > 0 && <span style={{ color: 'var(--brand-ink)' }} title="Дней не зачтено">Н {sum.notCounted}</span>}
                          {sum.absent > 0 && <span style={{ color: 'var(--brand-ink)' }} title="Прогулов за месяц">П {sum.absent}</span>}
                        </div>
                      )
                    })()}
                  </td>
                  {r.cells.map(c => {
                    const v = cellVisual(c.status)
                    const isLate = c.status === 'late_soft' || c.status === 'late_hard'
                    return (
                      <td
                        key={c.date}
                        title={c.attendance_id ? c.title + ' · нажмите, чтобы исправить' : c.title}
                        onClick={() => { if (c.attendance_id) setEditingId(c.attendance_id) }}
                        style={{
                          cursor: c.attendance_id ? 'pointer' : 'default',
                          background: v.bg, color: v.fg, textAlign: 'center',
                          padding: '9px 0 7px', lineHeight: 1.15,
                          borderBottomWidth: '2px', borderBottomStyle: 'solid',
                          borderBottomColor: 'transparent',
                          borderRight: '1px solid rgba(27,21,23,0.05)',
                          borderBottom: deviationBar(c),
                        }}
                      >
                        <div style={{ fontFamily: MONO, fontSize: '12px', fontWeight: v.weight }}>
                          {v.glyph}
                        </div>
                        {/* Минуты опоздания — мелко под буквой, без знака «+»:
                            прежний «+86» читался как бонус, хотя это нарушение. */}
                        {isLate && (
                          <div style={{ fontFamily: MONO, fontSize: '9px', fontWeight: 500, opacity: 0.8 }}>
                            {c.late_minutes}
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editingId && (
        <CorrectionModal
          attendanceId={editingId}
          onClose={() => setEditingId(null)}
          onSaved={() => void load(year, month)}
        />
      )}
    </div>
  )
}

const tabIdle: React.CSSProperties = {
  border: '1px solid var(--line)',
  background: 'var(--surface)', color: 'var(--ink-2)', borderRadius: '9px',
  padding: '8px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
  fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
}
const tabActive: React.CSSProperties = { ...tabIdle, background: 'var(--accent-deep)', color: 'var(--on-brand)', border: '1px solid var(--accent-deep)' }

const navBtn: React.CSSProperties = {
  border: 'none', background: 'transparent', color: 'var(--ink-2)', width: '30px', height: '30px',
  borderRadius: '8px', cursor: 'pointer', fontSize: '16px', lineHeight: 1,
}
const panel: React.CSSProperties = {
  background: 'var(--surface)', borderRadius: '16px', padding: '22px 24px',
  border: '1px solid var(--line)', fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
}
const thBase: React.CSSProperties = {
  background: 'var(--surface-2)', color: 'var(--ink-3)', padding: '10px 6px',
  fontWeight: 600, fontSize: '11px', textAlign: 'center',
}
const tdName: React.CSSProperties = {
  background: 'var(--surface)', padding: '10px 14px', borderBottom: '1px solid var(--line)',
  borderRight: '1px solid var(--line)', whiteSpace: 'nowrap',
}

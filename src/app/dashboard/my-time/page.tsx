'use client'

// ─── Экран «Моё время» ────────────────────────────────────────────────────────
//
// Узкий раздел для сотрудника — по образцу «Моей зарплаты»: он видит СВОИ факты
// и ничего больше. Раздел «Посещаемость» ему по-прежнему недоступен.
//
// ЧЕГО ЗДЕСЬ НЕТ И НЕ ДОЛЖНО ПОЯВИТЬСЯ: счётчиков опозданий, порогов, «осталось
// N до разговора» и любых чужих данных. Это требование владельца из фазы 1, и
// держится оно не разметкой: действия, отдающие счётчики (getAttendanceCounters),
// требуют права на посещаемость с областью team/all, которого у сотрудника нет.
//
// Три вещи, которые сотруднику действительно нужны:
//   1. что у него записано за месяц;
//   2. подать заявку на отпуск и увидеть ответ;
//   3. узнать, за какие дни он должен объяснительную, и приложить её фото.

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { getMyAttendance, type MyAttendanceDay } from '@/actions/attendance'
import { getMyVacations, submitVacationRequest, type VacationRequestRow } from '@/actions/vacations'
import {
  getMyExplanationDebt, prepareExplanationUpload, registerExplanation,
  type MyExplanationDebt,
} from '@/actions/attendance-explanations'
import { createClient } from '@/lib/supabase/client'

const RU_MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']

const panel: React.CSSProperties = {
  background: 'var(--surface)', borderRadius: '16px', padding: '18px 20px',
  border: '1px solid var(--line)', fontFamily: "'IBM Plex Sans', system-ui, sans-serif", color: 'var(--ink)',
}
const field: React.CSSProperties = {
  background: 'var(--surface-2)', border: '1.5px solid var(--line)', borderRadius: '9px',
  padding: '8px 11px', fontSize: '13px', color: 'var(--ink)', fontFamily: 'inherit',
}
function primary(disabled: boolean): React.CSSProperties {
  return {
    border: 'none', borderRadius: '9px', padding: '9px 16px', fontSize: '13px',
    fontWeight: 600, fontFamily: 'inherit', color: 'var(--on-brand)',
    background: 'var(--accent-deep)', opacity: disabled ? 0.5 : 1, cursor: disabled ? 'default' : 'pointer',
  }
}

function ruDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

const STATUS_LABEL: Record<VacationRequestRow['status'], string> = {
  pending: 'Ждёт решения', approved: 'Утверждён', rejected: 'Отказано', cancelled: 'Отменён',
}
const STATUS_STYLE: Record<VacationRequestRow['status'], { bg: string; fg: string }> = {
  pending:   { bg: 'var(--warn-soft-alt)', fg: 'var(--warn-strong)' },
  approved:  { bg: 'var(--ok-soft-alt)', fg: 'var(--series-positive-text)' },
  rejected:  { bg: 'var(--brand-soft)', fg: 'var(--series-negative-text)' },
  cancelled: { bg: 'var(--surface-2)', fg: 'var(--ink-2)' },
}

// Дневная строка: только факты, без оценок.
function dayLine(d: MyAttendanceDay): { text: string; color: string } {
  if (d.status === 'absent')   return { text: 'Отметки не было', color: 'var(--series-negative-text)' }
  if (d.status === 'sick')     return { text: 'Больничный', color: 'var(--ink-2)' }
  if (d.status === 'vacation') return { text: 'Отпуск', color: 'var(--ink-2)' }
  if (d.status === 'day_off')  return { text: 'Выходной', color: 'var(--ink-3)' }
  const parts: string[] = []
  if (d.check_in_time)  parts.push(`пришёл ${d.check_in_time.slice(11, 16)}`)
  if (d.late_minutes > 0) parts.push(`опоздание ${d.late_minutes} мин`)
  if (d.check_out_time) parts.push(`ушёл ${d.check_out_time.slice(11, 16)}`)
  else if (d.check_in_time) parts.push('смена не закрыта')
  if (d.overtime_minutes > 0)  parts.push(`переработка ${d.overtime_minutes} мин`)
  if (d.shortfall_minutes > 0) parts.push(`недоработка ${d.shortfall_minutes} мин`)
  return { text: parts.join(' · ') || '—', color: d.late_minutes > 0 ? 'var(--warn-strong)' : 'var(--series-positive-text)' }
}

export default function MyTimePage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [days, setDays] = useState<MyAttendanceDay[]>([])
  const [vacations, setVacations] = useState<VacationRequestRow[]>([])
  const [debt, setDebt] = useState<MyExplanationDebt[]>([])
  const [form, setForm] = useState({ from: '', to: '', comment: '' })
  const [busy, setBusy] = useState<string | null>(null)

  const loadMonth = useCallback(async (y: number, m: number) => {
    setDays(await getMyAttendance(y, m))
  }, [])

  const loadRest = useCallback(async () => {
    const [v, d] = await Promise.all([getMyVacations(), getMyExplanationDebt()])
    setVacations(v)
    setDebt(d)
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadMonth(year, month) }, [loadMonth, year, month])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadRest() }, [loadRest])

  const submitVacation = async () => {
    setBusy('vacation')
    const res = await submitVacationRequest(form.from, form.to, form.comment)
    setBusy(null)
    if (res.success) {
      toast.success('Заявка отправлена')
      setForm({ from: '', to: '', comment: '' })
      await loadRest()
    } else {
      toast.error(res.error)
    }
  }

  // Файл идёт в приватный бакет по одноразовому токену. Путь задаёт сервер —
  // с клиента он не приходит, иначе можно было бы записать в чужую папку.
  const upload = async (attendanceId: string, file: File) => {
    setBusy(attendanceId)
    try {
      const slot = await prepareExplanationUpload(attendanceId, file.type, file.size)
      if (!slot.ok) { toast.error(slot.error); return }

      const supabase = createClient()
      const { error } = await supabase.storage
        .from('explanations')
        .uploadToSignedUrl(slot.path, slot.token, file)
      if (error) { toast.error('Не удалось загрузить файл'); return }

      const res = await registerExplanation(attendanceId, slot.path, file.type, file.size)
      if (res.success) { toast.success('Объяснительная приложена'); await loadRest() }
      else toast.error(res.error)
    } finally {
      setBusy(null)
    }
  }

  const prevMonth = () => { if (month === 1) { setYear(y => y - 1); setMonth(12) } else setMonth(m => m - 1) }
  const nextMonth = () => { if (month === 12) { setYear(y => y + 1); setMonth(1) } else setMonth(m => m + 1) }

  const owed = debt.filter(d => !d.uploaded)
  const formReady = Boolean(form.from) && Boolean(form.to)

  return (
    <div className="flex flex-col gap-4 p-4 md:p-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="kicker">Личный кабинет</p>
          <h1 className="block-title span-rule mt-2">Моё время</h1>
          <p className="mt-2 max-w-xl text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
            Мои смены, отпуска и документы.
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {/* Долг по объяснительным — первым, потому что это единственное здесь,
            что требует действия. */}
        {owed.length > 0 && (
          <div style={{ ...panel, borderLeft: '4px solid var(--series-negative-text)' }}>
            <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '2px' }}>Нужна объяснительная</div>
            <p style={{ fontSize: '12.5px', color: 'var(--ink-3)', margin: '0 0 10px' }}>
              За эти дни опоздание было больше 15 минут. Напиши объяснительную от руки
              и приложи фотографию — заменить или удалить её потом нельзя.
            </p>
            {owed.map(d => (
              <div key={d.attendance_id} style={{ borderTop: '1px solid var(--line)', padding: '10px 0', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 200px' }}>
                  <div style={{ fontSize: '13.5px', fontWeight: 600 }}>{ruDate(d.date)} · {d.late_minutes} мин</div>
                  {d.reason && <div style={{ fontSize: '12.5px', color: 'var(--ink-3)' }}>«{d.reason}»</div>}
                </div>
                <label style={{ ...field, cursor: busy === d.attendance_id ? 'default' : 'pointer', fontWeight: 600, color: 'var(--brand-ink)', background: 'var(--surface)', borderColor: 'var(--brand-ink)' }}>
                  {busy === d.attendance_id ? 'Загрузка…' : 'Приложить фото'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic"
                    disabled={busy === d.attendance_id}
                    style={{ display: 'none' }}
                    onChange={e => {
                      const f = e.target.files?.[0]
                      e.target.value = ''   // тот же файл можно выбрать повторно после ошибки
                      if (f) void upload(d.attendance_id, f)
                    }}
                  />
                </label>
              </div>
            ))}
          </div>
        )}

        <div style={panel}>
          <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '10px' }}>Отпуск</div>
          <p style={{ fontSize: '12.5px', color: 'var(--ink-3)', margin: '0 0 10px' }}>
            До 7 дней, один раз в полугодие, заявка минимум за 7 дней. Отпуск доступен
            после 6 месяцев работы.
          </p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
            <input type="date" value={form.from} onChange={e => setForm(s => ({ ...s, from: e.target.value }))} style={{ ...field, flex: '1 1 150px' }} />
            <input type="date" value={form.to} onChange={e => setForm(s => ({ ...s, to: e.target.value }))} style={{ ...field, flex: '1 1 150px' }} />
          </div>
          <textarea
            value={form.comment}
            onChange={e => setForm(s => ({ ...s, comment: e.target.value }))}
            placeholder="Комментарий (необязательно)"
            rows={2}
            style={{ ...field, width: '100%', resize: 'vertical', marginBottom: '10px' }}
          />
          <button onClick={() => void submitVacation()} disabled={busy === 'vacation' || !formReady} style={primary(busy === 'vacation' || !formReady)}>
            {busy === 'vacation' ? 'Отправка…' : 'Отправить заявку'}
          </button>

          {vacations.map(v => {
            const s = STATUS_STYLE[v.status]
            return (
              <div key={v.id} style={{ borderTop: '1px solid var(--line)', padding: '10px 0', marginTop: '10px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <span style={{ background: s.bg, color: s.fg, borderRadius: '6px', padding: '3px 8px', fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {STATUS_LABEL[v.status]}
                </span>
                <div>
                  <div style={{ fontSize: '13.5px', fontWeight: 600 }}>{ruDate(v.date_from)} — {ruDate(v.date_to)} · {v.days_count} дн.</div>
                  {v.decision_comment && (
                    <div style={{ fontSize: '12.5px', color: 'var(--ink-3)', marginTop: '3px' }}>«{v.decision_comment}»</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div style={panel}>
          <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '10px' }}>Мои смены</div>
          {days.length === 0 && <div style={{ fontSize: '13.5px', color: 'var(--ink-3)' }}>За этот месяц записей нет.</div>}
          {days.map(d => {
            const line = dayLine(d)
            return (
              <div key={d.date} style={{ borderTop: '1px solid var(--line)', padding: '9px 0', display: 'flex', gap: '12px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, minWidth: '86px' }}>{ruDate(d.date)}</div>
                <div style={{ fontSize: '13px', color: line.color }}>{line.text}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

const navBtn: React.CSSProperties = {
  border: 'none', background: 'transparent', color: 'var(--ink-2)', fontSize: '20px',
  lineHeight: 1, padding: '2px 8px', cursor: 'pointer',
}

'use client'

// ─── Виджет посещаемости: приход, причина опоздания, подмена, конец смены ──────
//
// Заменяет прежний AttendancePing. Отличия:
//   • дату и окно приёма считает сервер в Asia/Bishkek. Прежний localStorage-замок
//     считал дату по UTC и с 00:00 до 06:00 глушил отметку вовсе (аудит 7.7);
//   • подмена требует ОБЯЗАТЕЛЬНОЙ причины и её типа (правило владельца);
//   • появилась кнопка «Закончить смену» — она же считает переработку/недоработку;
//   • фаза 2: при опоздании от 5 минут причина спрашивается ПРЯМО СЕЙЧАС и её
//     нельзя пропустить.
//
// Замка от повторов на клиенте нет: сервер идемпотентен (UNIQUE employee_id+date),
// повторный вызов возвращает 'already' и ничего не портит.
//
// ЧЕГО ЗДЕСЬ НЕТ И НЕ ДОЛЖНО ПОЯВИТЬСЯ: счётчиков опозданий, порогов и любых
// намёков на то, насколько сотрудник близок к увольнению. Он видит только свои
// факты. Это требование владельца, и держится оно не сокрытием разметки —
// действия, отдающие счётчики, сотруднику просто недоступны по правам.

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  registerCheckIn, registerCheckOut, registerSubstitution,
  getSubstitutionCandidates, getTodayAttendance,
  type Colleague, type MyAttendanceDay, type SubstitutionReasonType,
} from '@/actions/attendance'
import { recordLateReason } from '@/actions/attendance-explanations'

const SHEET: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(27,21,23,0.45)', backdropFilter: 'blur(4px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
}
const CARD: React.CSSProperties = {
  background: 'var(--surface)', borderRadius: '16px', padding: '26px 28px', maxWidth: '440px',
  width: '100%', border: '1px solid var(--line)', boxShadow: '0 20px 60px -20px rgba(27,21,23,0.35)',
  fontFamily: "'IBM Plex Sans', system-ui, sans-serif", color: 'var(--ink)',
}
const FIELD: React.CSSProperties = {
  width: '100%', background: 'var(--surface-2)', border: '1.5px solid var(--line)', borderRadius: '10px',
  padding: '10px 13px', fontSize: '13.5px', color: 'var(--ink)', fontFamily: 'inherit',
}
function primaryBtn(disabled: boolean): React.CSSProperties {
  return {
    border: 'none', background: 'var(--accent-deep)', color: 'var(--on-brand)',
    borderRadius: '9px', padding: '10px 18px', fontSize: '13.5px', fontWeight: 600,
    opacity: disabled ? 0.5 : 1, cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit',
  }
}

const REASON_TYPES: { value: SubstitutionReasonType; label: string }[] = [
  { value: 'illness',  label: 'Болезнь — коллеге проставится больничный' },
  { value: 'personal', label: 'Личная просьба коллеги' },
  { value: 'other',    label: 'Другое' },
]

interface LateAsk { attendanceId: string; minutes: number; needsNote: boolean }

export default function AttendanceWidget() {
  const fired = useRef(false)
  const [today, setToday] = useState<MyAttendanceDay | null>(null)
  const [candidates, setCandidates] = useState<Colleague[] | null>(null)
  const [choice, setChoice] = useState('')
  const [reason, setReason] = useState('')
  const [reasonType, setReasonType] = useState<SubstitutionReasonType | ''>('')
  const [lateAsk, setLateAsk] = useState<LateAsk | null>(null)
  const [lateText, setLateText] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (fired.current) return
    fired.current = true

    void (async () => {
      const res = await registerCheckIn()

      if (res.status === 'checked_in') {
        if (res.late_grade === 'on_time' || res.late_grade === 'late_forgiven') {
          toast.success('Приход отмечен · вовремя')
        } else if (!res.counts_as_worked) {
          toast.error(`Опоздание ${res.late_minutes} мин — день не засчитан как рабочий`)
        } else {
          toast.warning(`Отмечено опоздание: ${res.late_minutes} мин`)
        }
        if (res.needs_reason && res.attendance_id) {
          setLateAsk({ attendanceId: res.attendance_id, minutes: res.late_minutes, needsNote: res.needs_note })
        }
      } else if (res.status === 'already') {
        // Вкладку могли закрыть, не дописав причину, — спрашиваем снова.
        if (res.needs_reason && res.attendance_id) {
          setLateAsk({ attendanceId: res.attendance_id, minutes: res.late_minutes, needsNote: res.needs_note })
        }
      } else if (res.status === 'skip' && res.reason === 'not_tracked') {
        return // учёт не ведётся — виджет не показываем вовсе
      }

      setToday(await getTodayAttendance())

      // Вышел в выходной — предложить отметить подмену.
      if (res.status === 'skip' && res.reason === 'day_off') {
        setCandidates(await getSubstitutionCandidates())
      }
    })()
  }, [])

  const submitLateReason = async () => {
    if (!lateAsk || lateText.trim().length === 0) return
    setSaving(true)
    const res = await recordLateReason(lateAsk.attendanceId, lateText)
    setSaving(false)
    if (res.success) {
      setLateAsk(null)
      setLateText('')
      toast.success(lateAsk.needsNote ? 'Причина записана. Не забудь объяснительную' : 'Причина записана')
    } else {
      toast.error(res.error)
    }
  }

  const substitutionReady = Boolean(choice) && reason.trim().length > 0 && reasonType !== ''

  const submitSubstitution = async () => {
    // substitutionReady уже включает reasonType !== '' — TS сужает тип по этому флагу.
    if (!substitutionReady) return
    setSaving(true)
    const res = await registerSubstitution(choice, reason, reasonType)
    setSaving(false)
    if (res.success) {
      toast.success(res.sickMarked
        ? 'Выход засчитан как подмена. Коллеге проставлен больничный'
        : 'Выход засчитан как подмена')
      // Больничный не проставился, хотя причина — болезнь: коллега уже отметился сам.
      // Молча проглатывать это нельзя, иначе подменяющий уверен, что всё оформлено.
      if (res.sickSkipped === 'covered_already_checked_in') {
        toast.warning('Коллега сегодня отметил приход сам — больничный не проставлен')
      } else if (res.sickSkipped === 'covered_day_has_other_status') {
        toast.warning('За коллегой этот день уже отмечен иначе — больничный не проставлен')
      }
      setCandidates(null)
      setToday(await getTodayAttendance())
    } else {
      toast.error(res.error)
    }
  }

  const endShift = async () => {
    setSaving(true)
    const res = await registerCheckOut()
    setSaving(false)
    if (res.status === 'checked_out') {
      const extra = res.overtime_minutes > 0 ? ` · переработка ${res.overtime_minutes} мин`
        : res.shortfall_minutes > 0 ? ` · недоработка ${res.shortfall_minutes} мин`
        : ''
      toast.success('Смена закрыта' + extra)
      setToday(await getTodayAttendance())
    } else if (res.status === 'already') {
      toast.info('Смена уже закрыта')
    } else {
      toast.error(res.error)
    }
  }

  return (
    <>
      {today?.is_open && !lateAsk && (
        <button
          onClick={() => void endShift()}
          disabled={saving}
          style={{
            position: 'fixed', right: '20px', bottom: '20px', zIndex: 900,
            border: 'none', background: 'var(--accent-deep)', color: 'var(--on-brand)',
            borderRadius: '11px', padding: '12px 18px', fontSize: '13.5px', fontWeight: 600,
            opacity: saving ? 0.5 : 1, cursor: saving ? 'default' : 'pointer', fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
            boxShadow: '0 10px 30px -10px rgba(27,21,23,0.35)',
          }}
        >
          {saving ? 'Сохранение…' : 'Закончить смену'}
        </button>
      )}

      {/* Причина опоздания. Закрыть нельзя: ни крестика, ни кнопки «позже», ни
          закрытия по клику мимо. Причина фиксируется в момент прихода — это и есть
          весь смысл. Правку задним числом запрещает триггер в БД. */}
      {lateAsk && (
        <div style={{ ...SHEET, zIndex: 1100 }}>
          <div style={CARD}>
            <div style={{ fontSize: '17px', fontWeight: 700, marginBottom: '6px' }}>
              Опоздание {lateAsk.minutes} мин
            </div>
            <p style={{ fontSize: '13.5px', color: 'var(--ink-3)', margin: '0 0 16px' }}>
              Напиши, что случилось. Ответ сохранится как есть и изменить его потом нельзя.
              {lateAsk.needsNote && ' Кроме того, за этот день нужна рукописная объяснительная — принеси её и приложи фото.'}
            </p>

            <textarea
              value={lateText}
              onChange={e => setLateText(e.target.value)}
              placeholder="Что произошло"
              rows={3}
              autoFocus
              style={{ ...FIELD, resize: 'vertical', marginBottom: '18px' }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => void submitLateReason()}
                disabled={saving || lateText.trim().length === 0}
                style={primaryBtn(saving || lateText.trim().length === 0)}
              >
                {saving ? 'Сохранение…' : 'Отправить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {candidates !== null && (
        <div style={SHEET}>
          <div style={CARD}>
            <div style={{ fontSize: '17px', fontWeight: 700, marginBottom: '6px' }}>Сегодня твой выходной</div>
            <p style={{ fontSize: '13.5px', color: 'var(--ink-3)', margin: '0 0 18px' }}>
              {candidates.length > 0
                ? 'Вышел, чтобы подменить коллегу? Выбери, кого, и укажи причину — этот день засчитается тебе как рабочий.'
                : 'В твоём отделе сегодня никто не должен работать — подмену отметить не получится.'}
            </p>

            {candidates.length > 0 && (
              <>
                <select
                  value={choice}
                  onChange={e => setChoice(e.target.value)}
                  style={{ ...FIELD, border: '1.5px solid var(--accent-deep)', fontSize: '14px', fontWeight: 600, cursor: 'pointer', marginBottom: '12px' }}
                >
                  <option value="">— выбери коллегу —</option>
                  {candidates.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>

                <select
                  value={reasonType}
                  onChange={e => setReasonType(e.target.value as SubstitutionReasonType | '')}
                  style={{ ...FIELD, cursor: 'pointer', marginBottom: '12px' }}
                >
                  <option value="">— почему его нет —</option>
                  {REASON_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>

                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="Причина подмены — обязательно"
                  rows={2}
                  style={{ ...FIELD, resize: 'vertical', marginBottom: '18px' }}
                />
              </>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setCandidates(null)}
                style={{ border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink-2)', borderRadius: '9px', padding: '10px 16px', fontSize: '13.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Нет, просто зашёл
              </button>
              {candidates.length > 0 && (
                <button
                  onClick={() => void submitSubstitution()}
                  disabled={saving || !substitutionReady}
                  style={primaryBtn(saving || !substitutionReady)}
                >
                  {saving ? 'Сохранение…' : 'Да, подменяю'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

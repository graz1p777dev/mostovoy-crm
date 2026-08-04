'use client'

// ─── Вкладка «Отпуска» ────────────────────────────────────────────────────────
//
// Видна только тем, у кого есть право 'vacations' с областью team/all — по
// умолчанию владельцу. Право делегируемое, поэтому 'owner' здесь нигде не зашит:
// решает сервер, а не эта разметка.
//
// Отказ требует комментария: человеку должно быть понятно, почему ему отказали.
// Это же проверяет CHECK в БД, так что обойти правило через другой вход нельзя.

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ShieldOff } from 'lucide-react'
import {
  getVacationsForReview, decideVacationRequest, registerVacationRetroactive,
  getVacationEmployees, type VacationRequestRow,
} from '@/actions/vacations'
import EmptyState from '@/components/common/EmptyState'
import PageLoader from '@/components/common/PageLoader'

const STATUS_LABEL: Record<VacationRequestRow['status'], string> = {
  pending:   'Ждёт решения',
  approved:  'Утверждён',
  rejected:  'Отказано',
  cancelled: 'Отменён',
}
const STATUS_STYLE: Record<VacationRequestRow['status'], { bg: string; fg: string }> = {
  pending:   { bg: 'var(--warn-soft-alt)', fg: 'var(--warn-strong)' },
  approved:  { bg: 'var(--ok-soft-alt)', fg: 'var(--series-positive-text)' },
  rejected:  { bg: 'var(--brand-soft)', fg: 'var(--series-negative-text)' },
  cancelled: { bg: 'var(--surface-2)', fg: 'var(--ink-2)' },
}

const panel: React.CSSProperties = {
  background: 'var(--surface)', borderRadius: '16px', padding: '18px 20px',
  border: '1px solid var(--line)', fontFamily: "'IBM Plex Sans', system-ui, sans-serif", color: 'var(--ink)',
}
const field: React.CSSProperties = {
  background: 'var(--surface-2)', border: '1.5px solid var(--line)', borderRadius: '9px',
  padding: '8px 11px', fontSize: '13px', color: 'var(--ink)', fontFamily: 'inherit',
}

function ruDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

export default function VacationsTab() {
  const [rows, setRows] = useState<VacationRequestRow[] | null>(null)
  const [denied, setDenied] = useState(false)
  const [comments, setComments] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)

  // Оформление задним числом
  const [retroOpen, setRetroOpen] = useState(false)
  const [retro, setRetro] = useState({ employeeId: '', from: '', to: '', comment: '' })
  const [staff, setStaff] = useState<{ id: string; name: string }[]>([])

  const load = useCallback(async () => {
    const res = await getVacationsForReview()
    if (res.ok) { setRows(res.rows); setDenied(false) }
    else { setRows([]); setDenied(true) }
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])
  // Список подтягивается один раз: владелец выбирает человека, а не вводит UUID.
  useEffect(() => { void (async () => setStaff(await getVacationEmployees()))() }, [])

  const decide = async (id: string, approve: boolean) => {
    setBusy(id)
    const res = await decideVacationRequest(id, approve, comments[id] ?? '')
    setBusy(null)
    if (res.success) {
      toast.success(approve ? 'Отпуск утверждён' : 'Отказ сохранён')
      await load()
    } else {
      toast.error(res.error)
    }
  }

  const submitRetro = async () => {
    setBusy('retro')
    const res = await registerVacationRetroactive(retro.employeeId, retro.from, retro.to, retro.comment)
    setBusy(null)
    if (res.success) {
      toast.success('Отпуск оформлен задним числом')
      setRetroOpen(false)
      setRetro({ employeeId: '', from: '', to: '', comment: '' })
      await load()
    } else {
      toast.error(res.error)
    }
  }

  if (denied) {
    return (
      <EmptyState
        icon={ShieldOff}
        title="Нет доступа к отпускам"
        hint="Отпуска утверждает тот, кому выдано право «Отпуска». По умолчанию это владелец; право можно передать в настройках ролей."
      />
    )
  }

  if (rows === null) return <PageLoader minHeight="30vh" />

  const pending = rows.filter(r => r.status === 'pending')
  const rest = rows.filter(r => r.status !== 'pending')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={panel}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <div style={{ fontSize: '15px', fontWeight: 700 }}>
            Ждут решения{pending.length > 0 ? ` · ${pending.length}` : ''}
          </div>
          <button
            onClick={() => setRetroOpen(o => !o)}
            style={{ ...field, cursor: 'pointer', fontWeight: 600, borderColor: 'var(--brand-ink)', color: 'var(--brand-ink)', background: 'var(--surface)' }}
          >
            {retroOpen ? 'Свернуть' : 'Оформить задним числом'}
          </button>
        </div>

        {retroOpen && (
          <div style={{ background: 'var(--surface-2)', borderRadius: '11px', padding: '14px', margin: '12px 0 4px' }}>
            <p style={{ fontSize: '12.5px', color: 'var(--ink-3)', margin: '0 0 10px' }}>
              Отпуск, о котором договорились устно. Комментарий обязателен — он объясняет,
              почему запись появилась после факта. Сотрудник так оформить отпуск не может.
            </p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
              <select
                value={retro.employeeId}
                onChange={e => setRetro(s => ({ ...s, employeeId: e.target.value }))}
                style={{ ...field, flex: '2 1 220px', cursor: 'pointer' }}
              >
                <option value="">— выберите сотрудника —</option>
                {staff.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <input type="date" value={retro.from} onChange={e => setRetro(s => ({ ...s, from: e.target.value }))} style={{ ...field, flex: '1 1 140px' }} />
              <input type="date" value={retro.to} onChange={e => setRetro(s => ({ ...s, to: e.target.value }))} style={{ ...field, flex: '1 1 140px' }} />
            </div>
            <textarea
              value={retro.comment}
              onChange={e => setRetro(s => ({ ...s, comment: e.target.value }))}
              placeholder="Почему оформляется задним числом — обязательно"
              rows={2}
              style={{ ...field, width: '100%', resize: 'vertical', marginBottom: '10px' }}
            />
            <button
              onClick={() => void submitRetro()}
              disabled={busy === 'retro' || !retro.employeeId || !retro.from || !retro.to || !retro.comment.trim()}
              style={{
                border: 'none', borderRadius: '9px', padding: '9px 16px', fontSize: '13px', fontWeight: 600,
                fontFamily: 'inherit', color: 'var(--on-brand)',
                background: 'var(--accent-deep)',
                opacity: (busy === 'retro' || !retro.employeeId || !retro.from || !retro.to || !retro.comment.trim()) ? 0.5 : 1,
                cursor: (busy === 'retro' || !retro.employeeId || !retro.from || !retro.to || !retro.comment.trim()) ? 'default' : 'pointer',
              }}
            >
              Оформить
            </button>
          </div>
        )}

        {pending.length === 0 && (
          <div style={{ fontSize: '13.5px', color: 'var(--ink-3)', marginTop: '8px' }}>Нерассмотренных заявок нет.</div>
        )}

        {pending.map(r => (
          <div key={r.id} style={{ borderTop: '1px solid var(--line)', paddingTop: '12px', marginTop: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600 }}>{r.employee_name}</div>
                <div style={{ fontSize: '13px', color: 'var(--ink-3)', marginTop: '2px' }}>
                  {ruDate(r.date_from)} — {ruDate(r.date_to)} · {r.days_count} дн. · полугодие {r.period_key}
                </div>
                {r.comment && (
                  <div style={{ fontSize: '13px', color: 'var(--ink)', marginTop: '6px' }}>«{r.comment}»</div>
                )}
              </div>
            </div>

            <textarea
              value={comments[r.id] ?? ''}
              onChange={e => setComments(c => ({ ...c, [r.id]: e.target.value }))}
              placeholder="Комментарий (обязателен при отказе)"
              rows={2}
              style={{ ...field, width: '100%', resize: 'vertical', margin: '10px 0' }}
            />

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => void decide(r.id, true)}
                disabled={busy === r.id}
                style={{ border: 'none', background: 'var(--series-positive-text)', color: 'var(--on-brand)', borderRadius: '9px', padding: '9px 16px', fontSize: '13px', fontWeight: 600, fontFamily: 'inherit', opacity: busy === r.id ? 0.5 : 1, cursor: busy === r.id ? 'default' : 'pointer' }}
              >
                Утвердить
              </button>
              <button
                onClick={() => void decide(r.id, false)}
                disabled={busy === r.id || (comments[r.id] ?? '').trim().length === 0}
                title={(comments[r.id] ?? '').trim().length === 0 ? 'При отказе комментарий обязателен' : undefined}
                style={{
                  border: '1px solid var(--line)', background: 'var(--surface)',
                  color: (comments[r.id] ?? '').trim().length === 0 ? 'var(--ink-3)' : 'var(--series-negative-text)',
                  borderRadius: '9px', padding: '9px 16px', fontSize: '13px', fontWeight: 600, fontFamily: 'inherit',
                  cursor: (comments[r.id] ?? '').trim().length === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                Отказать
              </button>
            </div>
          </div>
        ))}
      </div>

      <div style={panel}>
        <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '10px' }}>История</div>
        {rest.length === 0 && <div style={{ fontSize: '13.5px', color: 'var(--ink-3)' }}>Пока пусто.</div>}
        {rest.map(r => {
          const s = STATUS_STYLE[r.status]
          return (
            <div key={r.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', borderTop: '1px solid var(--line)', padding: '10px 0' }}>
              <span style={{ background: s.bg, color: s.fg, borderRadius: '6px', padding: '3px 8px', fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                {STATUS_LABEL[r.status]}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13.5px', fontWeight: 600 }}>{r.employee_name}</div>
                <div style={{ fontSize: '12.5px', color: 'var(--ink-3)' }}>
                  {ruDate(r.date_from)} — {ruDate(r.date_to)} · {r.days_count} дн.
                  {r.created_by_owner && ' · оформлен задним числом'}
                </div>
                {r.decision_comment && (
                  <div style={{ fontSize: '12.5px', color: 'var(--ink)', marginTop: '4px' }}>«{r.decision_comment}»</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

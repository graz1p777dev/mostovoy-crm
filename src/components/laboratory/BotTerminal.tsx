'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Terminal, Pause, Play, Eraser, CircleDot } from 'lucide-react'
import { botGet } from '@/lib/bot-api'
import { describe, statusColor, timeOf } from '@/lib/bot-log'
import type { BotActionLog, BotActionLogDetail, BotActionLogPage } from '@/types'

// Бот пишет каждый свой шаг в action_logs. Терминал — окно в эту таблицу:
// первый запрос забирает хвост, дальше только новое по курсору after_id.
const POLL_MS = 2000
const INITIAL_ROWS = 80

// Лента бесконечная, а вкладку не перезагружают сутками. Держим окно в памяти.
const MAX_ROWS = 400

const FILTERS = [
  { value: '', label: 'Всё' },
  { value: 'amocrm', label: 'amoCRM' },
  { value: 'openai', label: 'ИИ' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'pipeline', label: 'Пайплайн' },
] as const

export default function BotTerminal() {
  const [rows, setRows] = useState<BotActionLog[]>([])
  const [filter, setFilter] = useState<string>('')
  const [paused, setPaused] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<number | null>(null)
  const [detail, setDetail] = useState<BotActionLogDetail | null>(null)

  const cursor = useRef<number | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  // Автопрокрутка мешает, когда листаешь вверх, читая старое. Отключаем её,
  // пока пользователь не вернётся к низу ленты.
  const stick = useRef(true)

  // Смена фильтра — это другая выборка, курсор от старой к ней неприменим.
  // Сбрасываем здесь, а не в эффекте: это следствие клика, а не рендера.
  function changeFilter(next: string) {
    if (next === filter) return
    cursor.current = null
    stick.current = true
    setRows([])
    setFilter(next)
  }

  useEffect(() => {
    let cancelled = false

    async function tick() {
      if (paused) return
      const params = new URLSearchParams()
      if (cursor.current === null) params.set('limit', String(INITIAL_ROWS))
      else params.set('after_id', String(cursor.current))
      if (filter) params.set('action', filter)

      try {
        const page = await botGet<BotActionLogPage>(`/admin/action-logs?${params.toString()}`)
        if (cancelled) return
        setError(null)
        if (page.items.length === 0) return
        cursor.current = page.last_id
        setRows((prev) => [...prev, ...page.items].slice(-MAX_ROWS))
      } catch {
        if (!cancelled) setError('Нет связи с ботом')
      }
    }

    tick()
    const id = setInterval(tick, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [filter, paused])

  useEffect(() => {
    if (stick.current && boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight
  }, [rows])

  const onScroll = useCallback(() => {
    const box = boxRef.current
    if (!box) return
    stick.current = box.scrollHeight - box.scrollTop - box.clientHeight < 40
  }, [])

  async function toggleRow(id: number) {
    if (openId === id) {
      setOpenId(null)
      setDetail(null)
      return
    }
    setOpenId(id)
    setDetail(null)
    try {
      setDetail(await botGet<BotActionLogDetail>(`/admin/action-logs/${id}`))
    } catch {
      setDetail(null)
    }
  }

  return (
    <div className="rounded-2xl overflow-hidden bg-white">
      <div className="flex items-center justify-between gap-3 px-5 py-4" style={{ borderBottom: '1px solid #ece5e5' }}>
        <div className="flex items-center gap-2.5">
          <div className="rounded-lg p-1.5" style={{ backgroundColor: '#e11d1d' }}>
            <Terminal size={15} color="#fff" />
          </div>
          <span className="text-sm font-medium" style={{ color: '#1b1517' }}>
            Что делает бот
          </span>
          <span className="flex items-center gap-1 text-[11px]" style={{ color: paused ? '#6b6063' : '#047857' }}>
            <CircleDot size={11} className={paused ? '' : 'animate-pulse'} />
            {paused ? 'пауза' : 'живая лента'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => changeFilter(f.value)}
              className="rounded-lg px-2.5 py-1 text-[11px]"
              style={
                filter === f.value
                  ? { backgroundColor: '#e11d1d', color: '#fff' }
                  : { backgroundColor: '#f6f2f2', color: '#574d4f' }
              }
            >
              {f.label}
            </button>
          ))}
          <button
            onClick={() => setPaused((p) => !p)}
            className="rounded-lg p-1.5"
            style={{ backgroundColor: '#f6f2f2', color: '#1b1517' }}
            title={paused ? 'Продолжить' : 'Пауза'}
          >
            {paused ? <Play size={14} /> : <Pause size={14} />}
          </button>
          <button
            onClick={() => {
              setRows([])
              stick.current = true
            }}
            className="rounded-lg p-1.5"
            style={{ backgroundColor: '#f6f2f2', color: '#1b1517' }}
            title="Очистить окно"
          >
            <Eraser size={14} />
          </button>
        </div>
      </div>

      <div
        ref={boxRef}
        onScroll={onScroll}
        className="overflow-y-auto font-mono text-[11.5px] leading-relaxed px-4 py-3"
        style={{ backgroundColor: '#faf8f7', minHeight: 320, maxHeight: 520 }}
      >
        {error && <p style={{ color: '#c01818' }}>{error}</p>}
        {!error && rows.length === 0 && (
          <p style={{ color: '#6b6063' }}>Бот пока ничего не делал. Лента обновляется сама.</p>
        )}

        {rows.map((row) => (
          <div key={row.id}>
            <button
              onClick={() => toggleRow(row.id)}
              className="w-full text-left flex gap-2.5 py-0.5 hover:bg-black/[0.04] rounded"
            >
              <span style={{ color: '#6b6063' }}>{timeOf(row.created_at)}</span>
              <span style={{ color: statusColor(row.status) }}>▸</span>
              <span className="flex-1" style={{ color: '#1b1517' }}>
                {describe(row)}
              </span>
              {row.amocrm_lead_id && (
                <span style={{ color: '#6b6063' }} className="shrink-0">
                  {row.client_name ?? `лид ${row.amocrm_lead_id}`}
                </span>
              )}
            </button>

            {row.error && (
              <div className="pl-[86px] pb-0.5" style={{ color: '#c01818' }}>
                {row.error}
              </div>
            )}

            {openId === row.id && (
              <pre
                className="my-1 ml-[86px] p-2.5 rounded-lg overflow-x-auto text-[10.5px]"
                style={{ backgroundColor: '#f1ebeb', color: '#574d4f' }}
              >
                {detail ? JSON.stringify(detail, null, 2) : 'Загружаю…'}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

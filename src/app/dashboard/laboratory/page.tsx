'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { botGet, botJson } from '@/lib/bot-api'
import BotTerminal from '@/components/laboratory/BotTerminal'
import TestUsers from '@/components/laboratory/TestUsers'
import {
  Bot, User, Send, ImagePlus, Mic, X, RefreshCw, Sparkles,
  Rocket, BarChart2, Eraser, FlaskConical,
} from 'lucide-react'

type LabMsg = {
  role: 'user' | 'assistant'
  content: string
  images?: string[]
  tokens?: number
  cost?: number
  latency?: number
}

type ModelPrice = { model: string; input_cost_per_1m: number; output_cost_per_1m: number }

type MistakeCategory = { label: string; count: number }
type MistakeResult = {
  total_dialogues: number
  edited_count: number
  categories: MistakeCategory[]
  suggested_prompt_changes: string
  expected_improvement: string
}

const CATEGORY_COLORS = ['#c01818', '#e11d1d', '#c01818', '#c01818', '#d97706', '#059669', '#b5491f']

// Чат в песочнице стартует компактным и плавно «дорастает» до этого предела
// по мере переписки, дальше — обычный скролл.
const CHAT_MIN_HEIGHT = 140
const CHAT_MAX_HEIGHT = 560

const areaCls = 'w-full rounded-xl px-3 py-2.5 text-xs outline-none resize-y font-mono leading-relaxed'
const areaStyle = { backgroundColor: '#fdfbfb', color: '#1b1517' } as const
const btnPrimary = 'rounded-xl px-4 py-2 text-sm font-medium text-white disabled:opacity-50'
const muted = { color: '#6b6063' }

function Card({ icon, title, right, children }: { icon: React.ReactNode; title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl overflow-hidden glass">
      <div className="flex items-center justify-between gap-2.5 px-5 py-4" style={{ borderBottom: '1px solid rgba(28,20,22,0.07)' }}>
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-8 h-8 rounded-xl brand-gradient">
            {icon}
          </div>
          <h2 className="font-semibold text-sm text-foreground">{title}</h2>
        </div>
        {right}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: '#fdfbfb' }}>
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs font-semibold" style={{ color: '#1b1517', minWidth: 20, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

export default function LaboratoryPage() {
  const [history, setHistory] = useState<LabMsg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [images, setImages] = useState<string[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  const audioRef = useRef<HTMLInputElement>(null)
  const [transcribing, setTranscribing] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const chatInnerRef = useRef<HTMLDivElement>(null)
  const [chatHeight, setChatHeight] = useState(CHAT_MIN_HEIGHT)

  const [prices, setPrices] = useState<ModelPrice[]>([])
  const [model, setModel] = useState('')
  const [testPrompt, setTestPrompt] = useState('')
  const [promptLoaded, setPromptLoaded] = useState(false)
  const [storeMemory, setStoreMemory] = useState('')
  const [clientMemory, setClientMemory] = useState('')
  const [deploying, setDeploying] = useState(false)
  const [deployed, setDeployed] = useState(false)

  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const [editBusy, setEditBusy] = useState(false)

  useEffect(() => {
    botGet<ModelPrice[]>('/admin/model-pricing').then(list => {
      setPrices(list)
      if (list.length) setModel(list.find(p => p.model === 'gpt-5.1')?.model || list[0].model)
    }).catch(() => {})
    botGet<{ prompt: string }>('/admin/bot-prompt').then(d => { setTestPrompt(d.prompt); setPromptLoaded(true) }).catch(() => {})
    botGet<{ memory: string }>('/admin/bot-memory').then(d => setStoreMemory(d.memory)).catch(() => {})
  }, [])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [history])

  // Чат «дорастает» до CHAT_MAX_HEIGHT по мере переписки вместо фиксированной высоты.
  useLayoutEffect(() => {
    const content = chatInnerRef.current?.scrollHeight ?? CHAT_MIN_HEIGHT
    setChatHeight(Math.min(CHAT_MAX_HEIGHT, Math.max(CHAT_MIN_HEIGHT, content + 24)))
  }, [history, loading, editingIdx])

  const selectedPrice = prices.find(p => p.model === model)
  const totals = useMemo(
    () => history.reduce((acc, m) => m.role === 'assistant'
      ? { tokens: acc.tokens + (m.tokens || 0), cost: acc.cost + (m.cost || 0) }
      : acc, { tokens: 0, cost: 0 }),
    [history]
  )

  function attachImage(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setImages(prev => [...prev, String(reader.result)])
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  async function attachAudio(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    // Бот в проде не «слушает» аудио напрямую — он транскрибирует голосовое
    // через Whisper и работает уже с текстом. Повторяем это здесь: отправляем
    // mp3/голосовое на тот же backend-эндпоинт и вставляем расшифровку как
    // сообщение клиента.
    setTranscribing(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/backend/admin/ai-test/transcribe', { method: 'POST', body: form })
      const data = (await res.json()) as { ok: boolean; text?: string; error?: string }
      if (!res.ok || !data.ok || !data.text) {
        setInput(prev => `${prev}${prev ? ' ' : ''}[голосовое «${file.name}» — не удалось расшифровать${data.error ? `: ${data.error}` : ''}] `)
        return
      }
      setInput(prev => (prev ? `${prev} ${data.text}` : (data.text ?? '')))
    } catch {
      setInput(prev => `${prev}${prev ? ' ' : ''}[голосовое «${file.name}» — ошибка расшифровки] `)
    } finally {
      setTranscribing(false)
    }
  }

  async function send() {
    const text = input.trim()
    if ((!text && images.length === 0) || loading) return
    const sentImages = images
    const newHistory: LabMsg[] = [...history, { role: 'user', content: text || '[изображение]', images: sentImages }]
    setHistory(newHistory)
    setInput('')
    setImages([])
    setLoading(true)
    const memory = [storeMemory.trim(), clientMemory.trim() && `ПАМЯТЬ О КЛИЕНТЕ (эта тестовая сессия):\n${clientMemory.trim()}`]
      .filter(Boolean).join('\n\n---\n')
    try {
      const res = await botJson<{ ok: boolean; reply: string; tokens?: number; cost?: number; latency_ms?: number }>(
        '/admin/ai-test', 'POST',
        {
          message: text || '[клиент прислал фото]',
          history: history.map(m => ({ role: m.role, content: m.content })),
          model,
          temperature: 0.5,
          system_prompt: promptLoaded ? testPrompt : '',
          memory,
          is_working_hours: true,
          lang: 'ru',
          images: sentImages,
        }
      )
      setHistory(prev => [...prev, { role: 'assistant', content: res.reply, tokens: res.tokens, cost: res.cost, latency: res.latency_ms }])
    } catch {
      setHistory(prev => [...prev, { role: 'assistant', content: '❌ Ошибка запроса' }])
    } finally {
      setLoading(false)
    }
  }

  async function submitEdit(idx: number) {
    if (!editText.trim() || editBusy) return
    const precedingUser = [...history.slice(0, idx)].reverse().find(m => m.role === 'user')
    setEditBusy(true)
    try {
      const res = await botJson<{ reply: string; tokens: number; cost: number }>(
        '/admin/lab/edit-reply', 'POST',
        { original_reply: history[idx].content, client_message: precedingUser?.content || '', edit_prompt: editText }
      )
      setHistory(prev => prev.map((m, i) => i === idx
        ? { ...m, content: res.reply, tokens: (m.tokens || 0) + res.tokens, cost: (m.cost || 0) + res.cost }
        : m))
      setEditingIdx(null)
      setEditText('')
    } finally {
      setEditBusy(false)
    }
  }

  async function deployPrompt() {
    if (!confirm('Заменить боевой промпт бота этим текстом? Изменение сразу повлияет на реальных клиентов.')) return
    setDeploying(true)
    try {
      await botJson('/admin/bot-prompt', 'PATCH', { prompt: testPrompt })
      setDeployed(true)
      setTimeout(() => setDeployed(false), 2500)
    } finally {
      setDeploying(false)
    }
  }

  return (
    <div className="p-4 md:p-8 flex flex-col gap-5 max-w-6xl">
      <div className="rounded-2xl px-5 py-4" style={{ backgroundColor: '#fff7ed', border: '1px solid #fde68a' }}>
        <p className="text-xs" style={{ color: '#92400e' }}>
          Песочница для тестирования бота — ничего здесь не влияет на прод, кроме кнопки «Задеплоить в прод» у промпта.
        </p>
      </div>

      <div className="grid gap-5" style={{ gridTemplateColumns: '1fr 380px' }}>
        {/* Chat sandbox */}
        <Card
          icon={<FlaskConical size={15} color="#fff" />}
          title="Тестовый чат с ботом"
          right={
            <div className="flex items-center gap-3 text-xs" style={muted}>
              <span>🪙 сессия: {totals.tokens} ток.</span>
              <span style={{ color: '#047857' }}>${totals.cost.toFixed(5)}</span>
            </div>
          }
        >
          <div
            className="rounded-xl"
            style={{
              backgroundColor: '#fdfbfb',
              height: chatHeight,
              overflowY: chatHeight >= CHAT_MAX_HEIGHT ? 'auto' : 'hidden',
              transition: 'height 260ms cubic-bezier(0.22,1,0.36,1)',
            }}
          >
          <div ref={chatInnerRef} className="p-3 flex flex-col gap-3">
            {history.length === 0 && (
              <p className="text-sm text-center mt-16" style={muted}>
                Напишите сообщение клиента — бот ответит с черновиком промпта/памяти справа
              </p>
            )}
            {history.map((m, i) => (
              <div key={i} className={`flex flex-col gap-1 max-w-[85%] ${m.role === 'user' ? 'items-start self-start' : 'items-end self-end'}`}>
                <div className="flex items-center gap-1 text-[10px]" style={muted}>
                  {m.role === 'user' ? <><User size={9} /> Тестовый клиент</> : <><Bot size={9} /> ИИ бот</>}
                </div>
                {m.images && m.images.length > 0 && (
                  <div className="flex gap-1">
                    {m.images.map((img, j) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={j} src={img} alt="" className="w-20 h-20 object-cover rounded-lg" style={{ border: '1px solid #ece5e5' }} />
                    ))}
                  </div>
                )}
                <div
                  className="px-3.5 py-2 text-sm whitespace-pre-wrap break-words rounded-2xl"
                  style={m.role === 'user'
                    ? { backgroundColor: '#ffffff', border: '1px solid #ece5e5', color: '#1b1517', borderBottomLeftRadius: 4 }
                    : { backgroundColor: '#e11d1d', color: '#ffffff', borderBottomRightRadius: 4 }}
                >
                  {m.content}
                </div>
                {m.role === 'assistant' && (
                  <div className="flex items-center gap-2.5">
                    {m.tokens != null && (
                      <div className="flex gap-2 text-[10px]" style={muted}>
                        <span style={{ color: '#e11d1d' }}>🪙 {m.tokens}</span>
                        {m.cost != null && <span style={{ color: '#047857' }}>${m.cost.toFixed(5)}</span>}
                        {m.latency != null && <span style={{ color: '#b45309' }}>⚡{m.latency}ms</span>}
                      </div>
                    )}
                    <button
                      className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md"
                      style={{ backgroundColor: '#fdfbfb', color: '#e11d1d' }}
                      onClick={() => { setEditingIdx(editingIdx === i ? null : i); setEditText('') }}
                    >
                      <Sparkles size={10} /> Изменить с помощью ИИ
                    </button>
                  </div>
                )}
                {editingIdx === i && (
                  <div className="flex gap-1.5 w-full">
                    <input
                      value={editText}
                      onChange={e => setEditText(e.target.value)}
                      placeholder="Как исправить этот ответ?"
                      onKeyDown={e => { if (e.key === 'Enter') submitEdit(i) }}
                      className="flex-1 rounded-lg px-2.5 py-1.5 text-xs outline-none"
                      style={areaStyle}
                    />
                    <button
                      className={btnPrimary}
                      style={{ backgroundColor: '#e11d1d', padding: '5px 12px', fontSize: 11 }}
                      onClick={() => submitEdit(i)}
                      disabled={editBusy || !editText.trim()}
                    >
                      {editBusy ? '…' : 'OK'}
                    </button>
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="self-start rounded-2xl px-3.5 py-2 text-sm" style={{ backgroundColor: '#ffffff', border: '1px solid #ece5e5', color: '#6b6063', borderBottomLeftRadius: 4 }}>
                <RefreshCw size={12} className="inline mr-1 animate-spin" /> печатает…
              </div>
            )}
            <div ref={bottomRef} />
          </div>
          </div>

          {images.length > 0 && (
            <div className="flex gap-1.5 flex-wrap mt-3">
              {images.map((img, i) => (
                <div key={i} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img} alt="" className="w-14 h-14 object-cover rounded-lg" style={{ border: '1px solid #ece5e5' }} />
                  <button
                    onClick={() => setImages(prev => prev.filter((_, j) => j !== i))}
                    className="absolute flex items-center justify-center rounded-full text-xs"
                    style={{ top: -6, right: -6, width: 18, height: 18, backgroundColor: '#fff', border: '1px solid #ece5e5', color: '#6b6063' }}
                  >✕</button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2 mt-3">
            <input ref={fileRef} type="file" accept="image/*" onChange={attachImage} className="hidden" />
            <input ref={audioRef} type="file" accept="audio/mpeg,audio/mp3,.mp3,.ogg,.m4a,.wav,audio/*" onChange={attachAudio} className="hidden" />
            <div className="flex flex-col gap-1.5">
              <button onClick={() => fileRef.current?.click()} disabled={loading || transcribing} title="Прикрепить фото (реально анализируется)"
                className="rounded-lg p-2" style={{ backgroundColor: '#fdfbfb', color: '#e11d1d' }}>
                <ImagePlus size={15} />
              </button>
              <button onClick={() => audioRef.current?.click()} disabled={loading || transcribing} title="Прикрепить голосовое (mp3 — расшифровывается через Whisper, как в проде)"
                className="rounded-lg p-2" style={{ backgroundColor: '#fdfbfb', color: '#e11d1d' }}>
                {transcribing ? <RefreshCw size={15} className="animate-spin" /> : <Mic size={15} />}
              </button>
            </div>
            <textarea
              rows={2}
              placeholder="Сообщение тестового клиента… (Ctrl+Enter)"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) send() }}
              disabled={loading}
              className="flex-1 resize-none rounded-xl px-3 py-2 text-sm outline-none"
              style={areaStyle}
            />
            <div className="flex flex-col gap-1.5">
              <button onClick={send} disabled={loading || (!input.trim() && images.length === 0)}
                className={btnPrimary} style={{ backgroundColor: '#e11d1d', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Send size={13} /> Отпр.
              </button>
              <button onClick={() => setHistory([])} className="rounded-xl px-4 py-1.5 text-xs" style={{ backgroundColor: '#fdfbfb', color: '#6b6063' }}>
                <X size={12} className="inline mr-1" /> Очистить
              </button>
            </div>
          </div>
        </Card>

        {/* Settings column */}
        <div className="flex flex-col gap-4">
          <Card icon={<FlaskConical size={15} color="#fff" />} title="Модель">
            <select value={model} onChange={e => setModel(e.target.value)} className="w-full rounded-xl px-3 py-2 text-sm outline-none" style={areaStyle}>
              {prices.map(p => <option key={p.model} value={p.model}>{p.model}</option>)}
            </select>
            {selectedPrice && (
              <p className="text-xs mt-2" style={muted}>
                Вход: <b style={{ color: '#1b1517' }}>${selectedPrice.input_cost_per_1m.toFixed(2)}</b> / 1M ·{' '}
                Выход: <b style={{ color: '#1b1517' }}>${selectedPrice.output_cost_per_1m.toFixed(2)}</b> / 1M
              </p>
            )}
          </Card>

          <Card
            icon={<Bot size={15} color="#fff" />}
            title="Промпт (черновик)"
            right={
              <button onClick={deployPrompt} disabled={deploying || !promptLoaded}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                style={{ backgroundColor: '#c01818' }}>
                <Rocket size={11} /> {deploying ? '…' : deployed ? '✓ Задеплоено' : 'Задеплоить в прод'}
              </button>
            }
          >
            <textarea rows={12} value={testPrompt} onChange={e => setTestPrompt(e.target.value)}
              placeholder={promptLoaded ? '' : 'Загрузка...'} className={areaCls} style={areaStyle} />
          </Card>

          <Card icon={<Sparkles size={15} color="#fff" />} title="Память о магазине (черновик)">
            <textarea rows={6} value={storeMemory} onChange={e => setStoreMemory(e.target.value)} className={areaCls} style={areaStyle} />
          </Card>

          <Card
            icon={<Eraser size={15} color="#fff" />}
            title="Память о клиенте (эта сессия)"
            right={
              <button onClick={() => setClientMemory('')} className="flex items-center gap-1 text-xs px-2 py-1 rounded-md" style={{ backgroundColor: '#fdfbfb', color: '#6b6063' }}>
                <Eraser size={11} /> Стереть
              </button>
            }
          >
            <textarea rows={5} value={clientMemory} onChange={e => setClientMemory(e.target.value)}
              placeholder="Например: клиенту 28 лет, беспокоит акне, уже была консультация 3 дня назад…"
              className={areaCls} style={areaStyle} />
          </Card>
        </div>
      </div>

      <TestUsers />

      <BotTerminal />

      <MistakeAnalysis />
    </div>
  )
}

function MistakeAnalysis() {
  const [limit, setLimit] = useState(100)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<MistakeResult | null>(null)

  async function run() {
    setLoading(true)
    try {
      const r = await botGet<MistakeResult>(`/admin/lab/mistake-analysis?limit=${limit}`)
      setResult(r)
    } finally {
      setLoading(false)
    }
  }

  const maxCount = Math.max(1, ...(result?.categories.map(c => c.count) || [0]))

  return (
    <Card
      icon={<BarChart2 size={15} color="#fff" />}
      title="Анализ ошибок бота"
      right={
        <div className="flex items-center gap-2">
          <span className="text-xs" style={muted}>Последние</span>
          <input type="number" min={10} max={500} step={10} value={limit}
            onChange={e => setLimit(parseInt(e.target.value) || 100)}
            className="rounded-lg px-2 py-1 text-xs outline-none" style={{ ...areaStyle, width: 64 }} />
          <span className="text-xs" style={muted}>диалогов</span>
          <button onClick={run} disabled={loading} className={btnPrimary} style={{ backgroundColor: '#e11d1d', padding: '6px 14px', fontSize: 12 }}>
            {loading ? 'Анализирую…' : 'Проанализировать'}
          </button>
        </div>
      }
    >
      {!result ? (
        <p className="text-sm" style={muted}>Нажмите «Проанализировать», чтобы найти повторяющиеся ошибки бота в последних диалогах.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-xs" style={muted}>
            Из последних <b style={{ color: '#1b1517' }}>{result.total_dialogues}</b> диалогов менеджер исправил
            бота в <b style={{ color: '#1b1517' }}>{result.edited_count}</b> случаях.
            {result.edited_count === 0 && ' Правок не найдено — анализировать нечего.'}
          </p>

          {result.categories.length > 0 && (
            <div className="flex flex-col gap-2.5">
              {result.categories.slice().sort((a, b) => b.count - a.count).map((c, i) => (
                <div key={c.label}>
                  <div className="text-sm mb-1" style={{ color: '#1b1517' }}>{c.label}</div>
                  <Bar value={c.count} max={maxCount} color={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                </div>
              ))}
            </div>
          )}

          {result.suggested_prompt_changes && (
            <div>
              <div className="text-xs font-bold uppercase tracking-wide mb-1.5" style={muted}>Предлагаемые изменения промпта</div>
              <div className="text-sm whitespace-pre-wrap leading-relaxed rounded-xl px-3 py-2.5" style={{ backgroundColor: '#fdfbfb', color: '#1b1517' }}>
                {result.suggested_prompt_changes}
              </div>
              <p className="text-xs mt-1.5" style={muted}>
                Это только предложение — скопируйте нужное в черновик промпта выше и проверьте в тестовом чате, прежде
                чем деплоить. Автоматически промпт не меняется.
              </p>
            </div>
          )}

          {result.expected_improvement && (
            <div>
              <div className="text-xs font-bold uppercase tracking-wide mb-1.5" style={muted}>
                Оценка эффекта (экспертная оценка ИИ, не измеренная метрика)
              </div>
              <p className="text-sm" style={{ color: '#1b1517' }}>{result.expected_improvement}</p>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

'use client'

// «Лаборатория» — песочница бота витрины «МОСТОВОЙ».
// Сообщение уходит в POST /crm/developer/lab: витрина зовёт модель и
// возвращает ответ, не создавая диалог и ничего не отправляя клиентам.
// Промпты здесь — черновики: они действуют только на текущий запрос,
// сохраняются они в разделе «Настройки бота».

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Bot, Eraser, FlaskConical, RotateCcw, Send, User } from 'lucide-react'
import { runShopBotLab } from '@/actions/mostovoy-developer'
import type { ShopBotSettings } from '@/lib/models/mostovoy'

interface LabMessage {
  role: 'user' | 'assistant'
  content: string
  model?: string
  latencyMs?: number
}

type PromptField = 'systemPrompt' | 'characterPrompt' | 'rulesPrompt' | 'taskPrompt'

const PROMPT_FIELDS: [PromptField, string, string][] = [
  ['systemPrompt', 'Системный промпт', 'Кто такой бот и как он себя ведёт'],
  ['characterPrompt', 'Характер', 'Тон и манера общения'],
  ['rulesPrompt', 'Правила', 'Чего боту делать нельзя'],
  ['taskPrompt', 'Задача', 'Что бот должен добиться в диалоге'],
]

export function ShopBotLabClient({ settings }: { settings: ShopBotSettings }) {
  const [history, setHistory] = useState<LabMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [model, setModel] = useState(settings.model)
  const [prompts, setPrompts] = useState<Record<PromptField, string>>({
    systemPrompt: settings.systemPrompt,
    characterPrompt: settings.characterPrompt,
    rulesPrompt: settings.rulesPrompt,
    taskPrompt: settings.taskPrompt,
  })

  const streamRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = streamRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [history, busy])

  const dirty =
    model !== settings.model ||
    PROMPT_FIELDS.some(([field]) => prompts[field] !== settings[field])

  function resetPrompts() {
    setModel(settings.model)
    setPrompts({
      systemPrompt: settings.systemPrompt,
      characterPrompt: settings.characterPrompt,
      rulesPrompt: settings.rulesPrompt,
      taskPrompt: settings.taskPrompt,
    })
  }

  async function send() {
    const message = input.trim()
    if (!message || busy) return
    const sentHistory = history.map(({ role, content }) => ({ role, content }))
    setHistory((prev) => [...prev, { role: 'user', content: message }])
    setInput('')
    setBusy(true)

    const result = await runShopBotLab({ message, history: sentHistory, model, prompts })
    if (result.ok) {
      setHistory((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: result.data.reply,
          model: result.data.model,
          latencyMs: result.data.latencyMs,
        },
      ])
    } else {
      toast.error(result.error)
      // Неотправленное сообщение возвращаем в поле, чтобы не набирать заново.
      setHistory((prev) => prev.slice(0, -1))
      setInput(message)
    }
    setBusy(false)
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="kicker">Изолировано от клиентов</p>
          <h1 className="block-title span-rule mt-2">Лаборатория</h1>
          <p className="mt-2 max-w-xl text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
            Проверьте, как бот витрины отвечает на реальные вопросы клиентов. Сообщения никуда
            не отправляются и диалог в CRM не создаётся — меняются только расход токенов
            и запись в журнале.
          </p>
        </div>
        <Link
          href="/dashboard/bot-settings"
          className="rounded-xl px-3.5 py-2 text-[11px] font-bold"
          style={{ border: '1px solid var(--line-strong)', color: 'var(--ink)' }}
        >
          Сохранить промпты в «Настройках бота»
        </Link>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
        {/* ── Песочница ─────────────────────────────────────────────── */}
        <section
          className="flex flex-col rounded-2xl"
          style={{ border: '1px solid var(--line)', background: 'var(--surface)' }}
        >
          <div
            className="flex flex-wrap items-center gap-2.5 px-5 py-4"
            style={{ borderBottom: '1px solid var(--line)' }}
          >
            <span
              className="grid h-8 w-8 place-items-center rounded-xl"
              style={{ background: 'var(--brand-soft)' }}
              aria-hidden
            >
              <FlaskConical size={15} style={{ color: 'var(--brand-ink)' }} />
            </span>
            <h2 className="mr-auto text-sm font-bold" style={{ color: 'var(--ink)' }}>
              Тестовый чат с ботом
            </h2>
            <button
              type="button"
              onClick={() => setHistory([])}
              disabled={history.length === 0}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-bold disabled:opacity-45"
              style={{ border: '1px solid var(--line-strong)', color: 'var(--ink-2)' }}
            >
              <Eraser size={12} aria-hidden />
              Очистить
            </button>
          </div>

          <div ref={streamRef} className="flex max-h-[520px] min-h-[280px] flex-col gap-3 overflow-y-auto p-5">
            {history.length === 0 && !busy ? (
              <div className="m-auto max-w-sm text-center">
                <span
                  className="mx-auto grid h-12 w-12 place-items-center rounded-2xl"
                  style={{ background: 'var(--brand-soft)' }}
                  aria-hidden
                >
                  <FlaskConical size={22} style={{ color: 'var(--brand-ink)' }} />
                </span>
                <b className="mt-3 block text-[15px]" style={{ color: 'var(--ink)' }}>
                  Напишите вопрос тестового клиента
                </b>
                <span className="mt-1.5 block text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
                  Ответ придёт от той же модели, что отвечает в проде, но с черновиками промптов справа.
                </span>
              </div>
            ) : (
              history.map((message, index) => {
                const own = message.role === 'user'
                return (
                  <article
                    key={index}
                    className="max-w-[86%] rounded-2xl px-3.5 py-2.5"
                    style={
                      own
                        ? {
                            alignSelf: 'flex-start',
                            border: '1px solid var(--line)',
                            background: 'var(--surface-2)',
                            borderBottomLeftRadius: 6,
                          }
                        : {
                            alignSelf: 'flex-end',
                            background: 'var(--accent-from)',
                            borderBottomRightRadius: 6,
                          }
                    }
                  >
                    <span
                      className="mb-1 flex items-center gap-1 text-[9.5px] font-bold uppercase tracking-wide"
                      style={{ color: own ? 'var(--ink-3)' : 'rgba(255,255,255,0.8)' }}
                    >
                      {own ? <User size={9} aria-hidden /> : <Bot size={9} aria-hidden />}
                      {own ? 'Тестовый клиент' : 'Бот витрины'}
                    </span>
                    <p
                      className="whitespace-pre-wrap text-[13px] leading-relaxed"
                      style={{ color: own ? 'var(--ink)' : 'var(--surface)' }}
                    >
                      {message.content}
                    </p>
                    {!own && message.model && (
                      <footer
                        className="mt-1.5 text-[9.5px] font-semibold"
                        style={{ color: 'rgba(255,255,255,0.82)' }}
                      >
                        {message.model} · {message.latencyMs} мс
                      </footer>
                    )}
                  </article>
                )
              })
            )}
            {busy && (
              <article
                className="max-w-[86%] self-end rounded-2xl px-3.5 py-2.5 text-[13px] text-white"
                style={{ background: 'var(--accent-from)', borderBottomRightRadius: 6 }}
              >
                Бот печатает…
              </article>
            )}
          </div>

          <form
            className="flex items-end gap-2.5 p-4"
            style={{ borderTop: '1px solid var(--line)' }}
            onSubmit={(e) => {
              e.preventDefault()
              void send()
            }}
          >
            <textarea
              rows={2}
              maxLength={4000}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault()
                  void send()
                }
              }}
              placeholder="Сообщение тестового клиента… (Ctrl+Enter — отправить)"
              className="flex-1 resize-none rounded-xl px-3.5 py-2.5 text-[13px] outline-none"
              style={{ border: '1px solid var(--line)', background: 'var(--surface-2)', color: 'var(--ink)' }}
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="brand-solid inline-flex h-11 items-center gap-1.5 rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Send size={14} aria-hidden />
              {busy ? 'Ждём…' : 'Запустить'}
            </button>
          </form>
        </section>

        {/* ── Черновики промптов ────────────────────────────────────── */}
        <aside className="flex flex-col gap-4">
          <section
            className="rounded-2xl p-5"
            style={{ border: '1px solid var(--line)', background: 'var(--surface)' }}
          >
            <div className="mb-3 flex items-center gap-2.5">
              <h2 className="mr-auto text-sm font-bold" style={{ color: 'var(--ink)' }}>
                Модель
              </h2>
              {dirty && (
                <button
                  type="button"
                  onClick={resetPrompts}
                  className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[10.5px] font-bold"
                  style={{ border: '1px solid var(--line-strong)', color: 'var(--ink-2)' }}
                >
                  <RotateCcw size={11} aria-hidden />
                  Вернуть сохранённое
                </button>
              )}
            </div>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full rounded-xl px-3 py-2.5 text-[12.5px] outline-none"
              style={{ border: '1px solid var(--line)', background: 'var(--surface-2)', color: 'var(--ink)' }}
            >
              {settings.models.map((item) => (
                <option key={item.id} value={item.id} disabled={!item.enabled}>
                  {item.label} · {item.provider}
                  {item.enabled ? '' : ' — нужен API-ключ'}
                </option>
              ))}
            </select>
            <p className="mt-2 text-[11px]" style={{ color: 'var(--ink-3)' }}>
              В проде бот работает на модели <b style={{ color: 'var(--ink)' }}>{settings.model}</b>.
              Здесь можно сравнить её с другой, не меняя настройки.
            </p>
          </section>

          {PROMPT_FIELDS.map(([field, label, hint]) => (
            <section
              key={field}
              className="rounded-2xl p-5"
              style={{ border: '1px solid var(--line)', background: 'var(--surface)' }}
            >
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <h2 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>
                  {label}
                </h2>
                {prompts[field] !== settings[field] && (
                  <small className="text-[10px] font-bold" style={{ color: 'var(--brand-ink)' }}>
                    черновик
                  </small>
                )}
              </div>
              <p className="mb-2 text-[11px]" style={{ color: 'var(--ink-3)' }}>
                {hint}
              </p>
              <textarea
                rows={field === 'systemPrompt' ? 7 : 4}
                value={prompts[field]}
                onChange={(e) => setPrompts((prev) => ({ ...prev, [field]: e.target.value }))}
                className="w-full resize-y rounded-xl px-3 py-2.5 font-mono text-[11.5px] leading-relaxed outline-none"
                style={{ border: '1px solid var(--line)', background: 'var(--surface-2)', color: 'var(--ink)' }}
              />
            </section>
          ))}
        </aside>
      </div>

      <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>
        Правки промптов действуют только на запросы из лаборатории и нигде не сохраняются.
        Каталог товаров витрина в песочницу не подставляет — бот отвечает без списка цен,
        поэтому проверять здесь стоит тон и логику, а не конкретные позиции.
      </p>
    </div>
  )
}

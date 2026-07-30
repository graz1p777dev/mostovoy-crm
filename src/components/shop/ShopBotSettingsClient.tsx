'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { BadgeCheck, Bot, GraduationCap, RotateCcw, Save, Cpu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { saveShopBotSettings } from '@/actions/mostovoy-bot-settings'
import {
  SHOP_BOT_PROMPT_LIMITS,
  type ShopBotPromptField,
  type ShopBotSettings,
  type ShopBotSettingsInput,
} from '@/lib/models/mostovoy'

const PROVIDER_LABELS: Record<string, string> = {
  deepseek: 'DeepSeek',
  openai: 'OpenAI',
  gemini: 'Google',
}

// Порядок и подписи полей — по тому, как витрина реально собирает запрос
// к модели (server/services/crm.js: _composePrompt и _summarizeConversation).
const PROMPT_FIELDS: {
  key: ShopBotPromptField
  label: string
  caption: string
  rows: number
}[] = [
  {
    key: 'systemPrompt',
    label: 'Системный промпт',
    caption:
      'Основа запроса к модели: идёт первым блоком, к нему витрина дописывает характер, правила, задачу и актуальный каталог активных товаров с ценами. Агрессивное обучение дополняет именно этот текст.',
    rows: 12,
  },
  {
    key: 'characterPrompt',
    label: 'Промпт характера',
    caption: 'Блок «ХАРАКТЕР» в системном сообщении — манера речи консультанта: как он звучит, а не что говорит.',
    rows: 4,
  },
  {
    key: 'rulesPrompt',
    label: 'Промпт правил',
    caption: 'Блок «ПРАВИЛА» — запреты и границы: чего боту нельзя выдумывать и когда передавать вопрос менеджеру.',
    rows: 4,
  },
  {
    key: 'taskPrompt',
    label: 'Промпт задачи',
    caption: 'Блок «ЗАДАЧА» — цель диалога: к чему бот ведёт клиента в каждом ответе.',
    rows: 4,
  },
  {
    key: 'hypervisorPrompt',
    label: 'Промпт гипервизора',
    caption:
      'Отдельный вызов модели: пересказывает контекст диалога для менеджера, и этот пересказ показывается в карточке подтверждения. Работает только при включённом подтверждении ответов и на сам ответ клиенту не влияет.',
    rows: 6,
  },
]

function toInput(settings: ShopBotSettings): ShopBotSettingsInput {
  const { models: _models, ...rest } = settings
  return rest
}

export function ShopBotSettingsClient({ settings }: { settings: ShopBotSettings }) {
  const [saved, setSaved] = useState<ShopBotSettings>(settings)
  const [form, setForm] = useState<ShopBotSettingsInput>(() => toInput(settings))
  const [saving, startSaving] = useTransition()

  const set = <K extends keyof ShopBotSettingsInput>(key: K, value: ShopBotSettingsInput[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const dirty = (Object.keys(form) as (keyof ShopBotSettingsInput)[]).some(
    (key) => form[key] !== saved[key]
  )
  const selectedModel = saved.models.find((item) => item.id === form.model)

  function handleSave() {
    startSaving(async () => {
      const result = await saveShopBotSettings(form)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      // Ответ PUT — перечитанное состояние витрины: им и заменяем форму,
      // чтобы на экране было ровно то, что лежит в её базе.
      setSaved(result.data)
      setForm(toInput(result.data))
      toast.success('Настройки бота сохранены')
      for (const warning of result.warnings) toast.warning(warning)
    })
  }

  function handleReset() {
    setForm(toInput(saved))
  }

  return (
    <div className="flex flex-col gap-5 p-4 md:p-8" style={{ maxWidth: 940 }}>
      <div>
        <div className="kicker">Витрина «МОСТОВОЙ» · бот магазина</div>
        <h1 className="block-title" style={{ marginTop: 7 }}>
          Настройки бота
        </h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--ink-3)' }}>
          Всё с этой страницы уходит в магазин — там живут Telegram/WhatsApp-бот и его промпты.
          Изменения применяются к следующему ответу бота.
        </p>
      </div>

      {/* ── Поведение ── */}
      <SectionCard icon={<Bot size={15} color="#fff" />} title="Поведение">
        <div className="flex flex-col gap-3">
          <ToggleRow
            icon={<BadgeCheck size={15} style={{ color: 'var(--brand-ink)' }} />}
            label="Подтверждать ответы перед отправкой"
            caption={
              form.approvalEnabled
                ? 'Ответ ИИ становится черновиком и ждёт менеджера в разделе подтверждений; вместе с ним готовится пересказ диалога от гипервизора.'
                : 'Ответ ИИ уходит клиенту сразу, без участия менеджера. Пересказ гипервизора не готовится.'
            }
            checked={form.approvalEnabled}
            onChange={(next) => set('approvalEnabled', next)}
            disabled={saving}
          />
          <div style={{ borderTop: '1px solid var(--line)' }} />
          <ToggleRow
            icon={<GraduationCap size={15} style={{ color: 'var(--brand-ink)' }} />}
            label="Агрессивное обучение"
            caption={
              form.aggressiveLearning
                ? 'Когда менеджер отклоняет черновик с причиной, витрина просит модель вывести универсальное правило и сама дописывает его в системный промпт. Промпт будет меняться без вашего участия.'
                : 'Отклонённые черновики только сохраняются как примеры для обучения. Системный промпт правите вручную.'
            }
            checked={form.aggressiveLearning}
            onChange={(next) => set('aggressiveLearning', next)}
            disabled={saving}
          />
        </div>
      </SectionCard>

      {/* ── Модель ── */}
      <SectionCard icon={<Cpu size={15} color="#fff" />} title="Модель">
        <p className="mb-3 text-xs" style={{ color: 'var(--ink-3)' }}>
          Одна модель на все задачи бота: ответы клиенту, пересказ гипервизора и калибровку промпта.
          Список задаёт витрина — своих значений добавить нельзя.
        </p>
        <Select
          value={form.model}
          onValueChange={(value) => set('model', value ?? form.model)}
          disabled={saving}
        >
          <SelectTrigger className="h-9" style={{ maxWidth: 360 }}>
            <SelectValue>{selectedModel?.label ?? form.model}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {saved.models.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.label}
                <span style={{ color: 'var(--ink-3)' }}>
                  {' · '}
                  {PROVIDER_LABELS[item.provider] ?? item.provider}
                  {item.enabled ? '' : ' · ключ не настроен'}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedModel && !selectedModel.enabled && (
          <p
            className="mt-3 rounded-xl px-3 py-2 text-xs"
            style={{ background: 'var(--brand-soft)', color: 'var(--brand-ink)' }}
          >
            У провайдера «{PROVIDER_LABELS[selectedModel.provider] ?? selectedModel.provider}» на витрине
            нет API-ключа. Настройку сохранить можно, но отвечать бот не сможет, пока ключ не добавят.
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          {saved.models.map((item) => (
            <span key={item.id} className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--ink-3)' }}>
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: item.enabled ? '#04815a' : 'var(--ink-4)' }}
              />
              {item.label} — {item.enabled ? 'ключ есть' : 'ключа нет'}
            </span>
          ))}
        </div>
      </SectionCard>

      {/* ── Промпты ── */}
      {PROMPT_FIELDS.map((field) => (
        <PromptCard
          key={field.key}
          label={field.label}
          caption={field.caption}
          rows={field.rows}
          limit={SHOP_BOT_PROMPT_LIMITS[field.key]}
          value={form[field.key]}
          onChange={(value) => set(field.key, value)}
          disabled={saving}
        />
      ))}

      {/* ── Сохранение ── */}
      {/* Промптов пять и они длинные — кнопка не должна уезжать за экран.
          Фон намеренно полностью непрозрачный: полупрозрачная плашка пропускала
          текст карточек под ней. */}
      <div
        className="sticky bottom-4 flex flex-wrap items-center gap-3 px-4 py-3"
        style={{
          background: '#ffffff',
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius-2xl)',
          boxShadow: '0 12px 32px -14px rgba(28,20,22,0.22)',
        }}
      >
        <Button onClick={handleSave} disabled={saving || !dirty} className="gap-1.5">
          <Save size={14} />
          {saving ? 'Сохранение…' : 'Сохранить настройки'}
        </Button>
        <Button variant="ghost" onClick={handleReset} disabled={saving || !dirty} className="gap-1.5">
          <RotateCcw size={14} />
          Вернуть как на витрине
        </Button>
        <span className="text-xs" style={{ color: dirty ? 'var(--brand-ink)' : 'var(--ink-3)' }}>
          {dirty ? 'Есть несохранённые изменения' : 'Всё сохранено на витрине'}
        </span>
      </div>
    </div>
  )
}

function SectionCard({
  icon, title, children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="overflow-hidden rounded-2xl bg-white" style={{ border: '1px solid var(--line)' }}>
      <div className="flex items-center gap-2.5 px-5 py-4" style={{ borderBottom: '1px solid var(--line)' }}>
        <div
          className="flex h-8 w-8 items-center justify-center rounded-xl"
          style={{ backgroundColor: '#e11d1d' }}
        >
          {icon}
        </div>
        <h2 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function ToggleRow({
  icon, label, caption, checked, onChange, disabled,
}: {
  icon: React.ReactNode
  label: string
  caption: string
  checked: boolean
  onChange: (next: boolean) => void
  disabled: boolean
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{label}</p>
        <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--ink-3)' }}>{caption}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50"
        style={{ backgroundColor: checked ? '#e11d1d' : 'var(--surface-3)' }}
      >
        <span
          className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all"
          style={{ left: checked ? 22 : 2, boxShadow: '0 1px 3px rgba(28,20,22,0.25)' }}
        />
      </button>
    </div>
  )
}

function PromptCard({
  label, caption, rows, limit, value, onChange, disabled,
}: {
  label: string
  caption: string
  rows: number
  limit: number
  value: string
  onChange: (value: string) => void
  disabled: boolean
}) {
  const used = value.trim().length
  const left = limit - used
  // Витрина режет текст без предупреждения — окрашиваем остаток заранее.
  const tight = left <= limit * 0.05
  const empty = used === 0

  return (
    <div className="rounded-2xl bg-white p-5" style={{ border: '1px solid var(--line)' }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Label className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{label}</Label>
        <span
          className="text-[11px] tabular-nums"
          style={{ color: tight ? 'var(--brand-ink)' : 'var(--ink-3)' }}
        >
          {used.toLocaleString('ru-RU')} / {limit.toLocaleString('ru-RU')} · осталось{' '}
          {left.toLocaleString('ru-RU')}
        </span>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed" style={{ color: 'var(--ink-3)' }}>{caption}</p>
      <Textarea
        value={value}
        rows={rows}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="mt-3 resize-y font-mono text-xs leading-relaxed"
      />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={disabled || empty}
          onClick={() => onChange('')}
          className="text-[11px] underline decoration-dotted underline-offset-2 disabled:opacity-40"
          style={{ color: 'var(--brand-ink)' }}
        >
          Очистить и вернуть промпт витрины по умолчанию
        </button>
        <span className="text-[11px]" style={{ color: empty ? 'var(--brand-ink)' : 'var(--ink-3)' }}>
          {empty
            ? 'Поле пустое: после сохранения витрина подставит сюда свой встроенный промпт.'
            : 'Пустое поле = встроенный промпт витрины, а не «бот без инструкции».'}
        </span>
      </div>
    </div>
  )
}

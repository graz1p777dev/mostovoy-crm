'use client'

import { useEffect, useState, useTransition } from 'react'
import { X, Trash2, Eraser, MessagesSquare, Send, Bot, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'
import Modal from '../Modal'
import { cn } from '@/lib/utils'
import {
  createDeal,
  updateDeal,
  deleteDeal,
  clearDealConversation,
  getDealConversation,
  sendDealMessage,
  setDealAiControl,
} from '@/actions/deals'
import type {
  Deal,
  DealCurrency,
  DealOrderType,
  DealEmployee,
  DealMessage,
  DealStage,
  DealViewer,
} from '@/types'
import { DEAL_CURRENCIES, DEAL_SOURCE } from './deal-config'

interface Props {
  deal: Deal | null
  isNew: boolean
  defaultStageId: string
  stages: DealStage[]
  employees: DealEmployee[]
  me: DealViewer
  onClose: () => void
  onSaved: () => void
}

interface FormState {
  title: string
  stage_id: string
  amount: string
  currency: DealCurrency
  order_type: DealOrderType
  customer_name: string
  customer_phone: string
  customer_username: string
  responsible_employee_id: string
  note: string
}

export default function DealModal({
  deal,
  isNew,
  defaultStageId,
  stages,
  employees,
  me,
  onClose,
  onSaved,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [messages, setMessages] = useState<DealMessage[] | null>(null)
  const [chatNote, setChatNote] = useState<string | null>(null)
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null)
  const [reply, setReply] = useState('')

  const [form, setForm] = useState<FormState>(() => ({
    title: deal?.title ?? '',
    stage_id: deal?.stage_id ?? defaultStageId,
    amount: deal?.amount !== null && deal?.amount !== undefined ? String(deal.amount) : '',
    currency: deal?.currency ?? 'KGS',
    order_type: deal?.order_type ?? 'standard',
    customer_name: deal?.customer_name ?? '',
    customer_phone: deal?.customer_phone ?? '',
    customer_username: deal?.customer_username ?? '',
    responsible_employee_id: deal?.responsible_employee_id ?? '',
    note: deal?.note ?? '',
  }))

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  // Переписка живёт во внешней системе — тянем её только для открытой сделки.
  useEffect(() => {
    if (isNew || !deal) return
    let alive = true
    void getDealConversation(deal.id).then((res) => {
      if (!alive) return
      setMessages(res.messages)
      setChatNote(res.note)
      setAiEnabled(res.aiEnabled)
    })
    return () => {
      alive = false
    }
  }, [isNew, deal])

  const handleSave = () => {
    if (!form.title.trim()) {
      toast.error('Введите название сделки')
      return
    }
    const amount = form.amount.trim() ? Number(form.amount.replace(',', '.')) : null
    if (amount !== null && !Number.isFinite(amount)) {
      toast.error('Сумма должна быть числом')
      return
    }

    const payload = {
      title: form.title,
      stage_id: form.stage_id,
      amount,
      currency: form.currency,
      order_type: form.order_type,
      customer_name: form.customer_name || null,
      customer_phone: form.customer_phone || null,
      customer_username: form.customer_username || null,
      responsible_employee_id: form.responsible_employee_id || null,
      note: form.note || null,
    }

    startTransition(async () => {
      const res = isNew ? await createDeal(payload) : await updateDeal(deal!.id, payload)
      if (res.success) {
        toast.success(isNew ? 'Сделка создана' : 'Изменения сохранены')
        onSaved()
        onClose()
      } else {
        toast.error(res.error)
      }
    })
  }

  const handleDelete = () => {
    if (!deal) return
    startTransition(async () => {
      const res = await deleteDeal(deal.id)
      if (res.success) {
        toast.success('Сделка удалена')
        onSaved()
        onClose()
      } else {
        toast.error(res.error)
      }
    })
  }

  const handleClearHistory = () => {
    if (!deal || !window.confirm('Очистить переписку этого лида? Сделка и карточка клиента останутся.')) return
    startTransition(async () => {
      const res = await clearDealConversation(deal.id)
      if (res.success) {
        setMessages([])
        setChatNote('История очищена')
        toast.success('История лида очищена')
      } else {
        toast.error(res.error)
      }
    })
  }

  const reloadConversation = async () => {
    if (!deal) return
    const res = await getDealConversation(deal.id)
    setMessages(res.messages)
    setChatNote(res.note)
    setAiEnabled(res.aiEnabled)
  }

  const handleSend = () => {
    if (!deal || !reply.trim()) return
    startTransition(async () => {
      const res = await sendDealMessage(deal.id, reply)
      if (!res.success) {
        toast.error(res.error)
        return
      }
      setReply('')
      await reloadConversation()
    })
  }

  const handleAiControl = () => {
    if (!deal || aiEnabled === null) return
    const next = !aiEnabled
    startTransition(async () => {
      const res = await setDealAiControl(deal.id, next)
      if (!res.success) {
        toast.error(res.error)
        return
      }
      setAiEnabled(next)
      toast.success(next ? 'Управление возвращено ИИ' : 'Диалог передан менеджеру')
    })
  }

  const source = deal ? DEAL_SOURCE[deal.source] : DEAL_SOURCE.manual
  const SourceIcon = source.icon
  const selectedStage = stages.find((stage) => stage.id === form.stage_id)

  return (
    <Modal onClose={onClose} variant="right">
      <div className="flex h-[100dvh] w-[min(720px,100vw)] flex-col overflow-hidden bg-white shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Шапка */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <h2 className="text-base font-bold text-gray-900">
              {isNew ? 'Новая сделка' : 'Сделка'}
            </h2>
            {!isNew && (
              <span
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
                style={{ color: source.color, background: source.bg }}
              >
                <SourceIcon size={11} />
                {source.label}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={18} />
          </button>
        </div>

        {/* Тело */}
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5 scroll-hidden">
          <div className="space-y-1.5">
            <Label>Название</Label>
            <Input
              autoFocus
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="Например: iPhone 17 Pro, клиент из Telegram"
              maxLength={300}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Этап</Label>
              <Select value={form.stage_id} onValueChange={(v) => set('stage_id', v as string)}>
                <SelectTrigger>
                  <SelectValue>{selectedStage?.name ?? 'Выберите этап'}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {stages.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      <span className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: s.color }}
                          aria-hidden
                        />
                        {s.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Ответственный</Label>
              <Select
                value={form.responsible_employee_id || 'none'}
                onValueChange={(v) => set('responsible_employee_id', v === 'none' ? '' : (v as string))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Не назначен</SelectItem>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-[1fr_120px] gap-3">
            <div className="space-y-1.5">
              <Label>Сумма</Label>
              <Input
                value={form.amount}
                onChange={(e) => set('amount', e.target.value)}
                placeholder="Пока не известна"
                inputMode="decimal"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Валюта</Label>
              <Select
                value={form.currency}
                onValueChange={(v) => set('currency', v as DealCurrency)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEAL_CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Тип заказа</Label>
            <Select value={form.order_type} onValueChange={(v) => set('order_type', v as DealOrderType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">Обычная покупка</SelectItem>
                <SelectItem value="installment">Рассрочка</SelectItem>
                <SelectItem value="trade_in">Trade-in</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Клиент</Label>
              <Input
                value={form.customer_name}
                onChange={(e) => set('customer_name', e.target.value)}
                placeholder="Имя"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Телефон</Label>
              <Input
                value={form.customer_phone}
                onChange={(e) => set('customer_phone', e.target.value)}
                placeholder="996…"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Ник</Label>
              <Input
                value={form.customer_username}
                onChange={(e) => set('customer_username', e.target.value)}
                placeholder="@username"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Заметка</Label>
            <Textarea
              value={form.note}
              onChange={(e) => set('note', e.target.value)}
              placeholder="Что обсудили, о чём договорились…"
              rows={3}
            />
          </div>

          {/* Переписка и управление каналом */}
          {!isNew && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <MessagesSquare size={14} className="text-gray-400" />
                <Label>Переписка</Label>
                {aiEnabled !== null && (
                  <button
                    onClick={handleAiControl}
                    disabled={isPending}
                    className={cn('ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50', aiEnabled ? 'bg-[#fdecec] text-[#c01818]' : 'bg-gray-900 text-white')}
                  >
                    {aiEnabled ? <><Bot size={13} /> ИИ отвечает</> : <><UserRound size={13} /> Менеджер отвечает</>}
                  </button>
                )}
                {me.role === 'owner' && messages && messages.length > 0 && (
                  <button
                    onClick={handleClearHistory}
                    disabled={isPending}
                    className="ml-auto inline-flex items-center gap-1 text-[11px] text-gray-400 transition-colors hover:text-[#c01818] disabled:opacity-50"
                  >
                    <Eraser size={12} />
                    Очистить историю
                  </button>
                )}
              </div>
              {messages === null ? (
                <p className="text-[12px] text-gray-400">Загружаем диалог…</p>
              ) : messages.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 px-4 py-5 text-center text-[12px] text-gray-400">
                  {chatNote ?? 'Переписки нет'}
                </div>
              ) : (
                <div className="max-h-72 space-y-1.5 overflow-y-auto rounded-xl bg-gray-50/70 p-3 scroll-hidden">
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={cn(
                        'max-w-[85%] rounded-xl px-3 py-1.5 text-[12px] leading-snug whitespace-pre-wrap',
                        m.direction === 'in'
                          ? 'bg-white text-gray-700 shadow-sm'
                          : 'ml-auto text-white brand-gradient'
                      )}
                    >
                      {m.text}
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <Textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                  rows={2}
                  placeholder="Написать клиенту…"
                  className="min-h-0 resize-none"
                  disabled={isPending || !deal?.external_key}
                />
                <Button onClick={handleSend} disabled={isPending || !reply.trim() || !deal?.external_key} className="h-auto px-3">
                  <Send size={16} />
                </Button>
              </div>
              {aiEnabled === null && <p className="text-[11px] text-gray-400">Для этого лида нет диалога, которым можно управлять через бот.</p>}
            </div>
          )}
        </div>

        {/* Низ */}
        <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-6 py-4">
          {!isNew && me.role === 'owner' ? (
            <button
              onClick={handleDelete}
              disabled={isPending}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] text-gray-400 transition-colors hover:bg-[#fdecec] hover:text-[#c01818] disabled:opacity-50"
            >
              <Trash2 size={15} />
              Удалить
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose} disabled={isPending}>
              Отмена
            </Button>
            <Button onClick={handleSave} disabled={isPending}>
              {isPending ? 'Сохраняем…' : isNew ? 'Создать' : 'Сохранить'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

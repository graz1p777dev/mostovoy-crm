'use client'

// ─── «Интеграции»: Товароучёт (живой статус) + Bitrix24 / amoCRM (конфиг) ──
// Товароучёт — та же БД Supabase, нечего "подключать": карточка честно об
// этом говорит и показывает реальные цифры. Bitrix24/amoCRM — форма конфига,
// URL входящего вебхука для вставки во внешнюю систему и кнопка проверки
// соединения, которая делает настоящий минимальный запрос к их API.

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Boxes, Building2, Radio, ExternalLink, Copy, RefreshCw, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  saveBitrix24Connection,
  saveAmoCrmConnection,
  testConnection,
  type IntegrationsData,
  type ExternalProvider,
  type ConnectionView,
} from '@/actions/integrations'

const INVENTORY_URL = process.env.NEXT_PUBLIC_INVENTORY_URL || 'http://localhost:3400'

const STATUS_LABEL: Record<ConnectionView['status'], string> = {
  not_configured: 'Не настроено',
  configured: 'Настроено, не проверено',
  connected: 'Подключено',
  error: 'Ошибка',
}

const STATUS_STYLE: Record<ConnectionView['status'], { bg: string; color: string }> = {
  not_configured: { bg: 'var(--surface-2)', color: 'var(--ink-3)' },
  configured: { bg: 'var(--info-soft)', color: 'var(--info)' },
  connected: { bg: 'var(--ok-soft)', color: 'var(--ok)' },
  error: { bg: 'var(--bad-soft)', color: 'var(--bad)' },
}

function StatusPill({ status }: { status: ConnectionView['status'] }) {
  const style = STATUS_STYLE[status]
  return (
    <span
      className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{ background: style.bg, color: style.color }}
    >
      {STATUS_LABEL[status]}
    </span>
  )
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function CardShell({ icon, title, subtitle, right, children }: {
  icon: React.ReactNode
  title: string
  subtitle: string
  right?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl overflow-hidden glass flex flex-col">
      <div className="flex items-start justify-between gap-3 px-5 py-4" style={{ borderBottom: '1px solid rgba(28,20,22,0.07)' }}>
        <div className="flex items-start gap-2.5">
          <div className="flex items-center justify-center w-8 h-8 rounded-xl brand-gradient flex-shrink-0">
            {icon}
          </div>
          <div>
            <h2 className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{title}</h2>
            <p className="text-[12px] mt-0.5" style={{ color: 'var(--ink-3)' }}>{subtitle}</p>
          </div>
        </div>
        {right}
      </div>
      <div className="p-5 flex flex-col gap-4 flex-1">{children}</div>
    </div>
  )
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span style={{ color: 'var(--ink-3)' }}>{label}</span>
      <span className="font-medium" style={{ color: 'var(--ink)' }}>{value}</span>
    </div>
  )
}

function InventoryCard({ inventory }: { inventory: IntegrationsData['inventory'] }) {
  return (
    <CardShell
      icon={<Boxes size={15} color="var(--on-brand)" />}
      title="Товароучёт"
      subtitle="MostovoyInventory"
      right={
        <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: 'var(--ok-soft)', color: 'var(--ok)' }}>
          Работает автоматически
        </span>
      }
    >
      <p className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
        Тот же проект Supabase, что и эта CRM — подключать и проверять нечего, данные читаются напрямую.
      </p>
      {!inventory.reachable ? (
        <p className="text-sm" style={{ color: 'var(--bad)' }}>
          Не удалось прочитать данные склада: {inventory.error ?? 'неизвестная ошибка'}
        </p>
      ) : (
        <div className="flex flex-col gap-2 rounded-xl p-3" style={{ background: 'var(--surface-2)' }}>
          <StatRow label="Товаров в каталоге" value={String(inventory.productCount)} />
          <StatRow label="Активных складов" value={String(inventory.activeWarehouseCount)} />
          <StatRow label="Последнее движение" value={fmtDate(inventory.lastMovementAt)} />
        </div>
      )}
      <Link
        href={INVENTORY_URL}
        target="_blank"
        rel="noreferrer"
        className="mt-auto inline-flex items-center gap-1.5 text-[13px] font-medium"
        style={{ color: 'var(--brand-ink)' }}
      >
        Открыть МостовойТовароучёт <ExternalLink size={13} />
      </Link>
    </CardShell>
  )
}

function EventsList({ provider, events }: { provider: ExternalProvider; events: IntegrationsData['events'] }) {
  const filtered = events.filter(e => e.provider === provider).slice(0, 5)
  if (!filtered.length) {
    return <p className="text-[12px]" style={{ color: 'var(--ink-4)' }}>Событий пока не было.</p>
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {filtered.map(e => (
        <li key={e.id} className="text-[11.5px] leading-snug" style={{ color: 'var(--ink-3)' }}>
          <span style={{ color: 'var(--ink-4)' }}>{fmtDate(e.received_at)}</span> — {e.payload_summary}
        </li>
      ))}
    </ul>
  )
}

function ExternalProviderCard({
  provider,
  title,
  connection,
  events,
  onSave,
  onSaved,
}: {
  provider: ExternalProvider
  title: string
  connection: ConnectionView
  events: IntegrationsData['events']
  onSave: (values: Record<string, string>) => Promise<{ success: boolean; error?: string }>
  onSaved: () => void
}) {
  const [modalOpen, setModalOpen] = useState(false)
  const [webhookUrl, setWebhookUrl] = useState('')
  const [subdomain, setSubdomain] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [savePending, startSave] = useTransition()
  const [testPending, startTest] = useTransition()

  const save = () => {
    startSave(async () => {
      const values: Record<string, string> = provider === 'bitrix24'
        ? { webhookUrl }
        : { subdomain, accessToken }
      const res = await onSave(values)
      if (res.success) {
        toast.success('Подключение сохранено')
        setModalOpen(false)
        onSaved()
      } else {
        toast.error(res.error ?? 'Ошибка сохранения')
      }
    })
  }

  const test = () => {
    startTest(async () => {
      const res = await testConnection(provider)
      if (res.success) toast.success('Соединение подтверждено')
      else toast.error(res.error ?? 'Не удалось подключиться')
      onSaved()
    })
  }

  const copyWebhook = () => {
    if (!connection.webhookUrl) return
    navigator.clipboard.writeText(connection.webhookUrl)
    toast.success('Ссылка скопирована')
  }

  return (
    <CardShell
      icon={<Building2 size={15} color="var(--on-brand)" />}
      title={title}
      subtitle={provider === 'bitrix24' ? 'Входящий REST-вебхук' : 'Подключение по поддомену и токену'}
      right={<StatusPill status={connection.status} />}
    >
      {connection.lastError && (
        <p className="text-[12px] rounded-lg px-2.5 py-1.5" style={{ background: 'var(--bad-soft)', color: 'var(--bad)' }}>
          {connection.lastError}
        </p>
      )}

      <div className="flex flex-col gap-1.5 text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
        {provider === 'bitrix24' ? (
          <span>Webhook: {connection.maskedConfig.webhookUrl || '—'}</span>
        ) : (
          <>
            <span>Поддомен: {connection.maskedConfig.subdomain || '—'}</span>
            <span>Токен: {connection.maskedConfig.accessToken || '—'}</span>
          </>
        )}
        <span>Последняя проверка: {fmtDate(connection.lastCheckedAt)}</span>
      </div>

      {connection.webhookUrl && (
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-4)' }}>
            URL для приёма событий
          </span>
          <div className="flex items-center gap-1.5">
            <code className="flex-1 truncate rounded-lg px-2.5 py-1.5 text-[11.5px]" style={{ background: 'var(--surface-2)', color: 'var(--ink-2)' }}>
              {connection.webhookUrl}
            </code>
            <Button type="button" size="icon" variant="outline" className="h-8 w-8 flex-shrink-0" onClick={copyWebhook}>
              <Copy size={13} />
            </Button>
          </div>
        </div>
      )}

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--ink-4)' }}>
          <Radio size={11} className="inline mr-1 -mt-0.5" />Последние события
        </p>
        <EventsList provider={provider} events={events} />
      </div>

      <div className="mt-auto flex gap-2">
        <Button type="button" variant="outline" className="flex-1" onClick={() => {
          setWebhookUrl(''); setSubdomain(''); setAccessToken(''); setModalOpen(true)
        }}>
          {connection.hasCredentials ? 'Изменить' : 'Настроить'}
        </Button>
        <Button type="button" className="flex-1" disabled={!connection.hasCredentials || testPending} onClick={test}>
          {testPending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Проверить
        </Button>
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}: подключение</DialogTitle>
          </DialogHeader>
          {provider === 'bitrix24' ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="bx-webhook">Входящий webhook URL Bitrix24</Label>
              <Input
                id="bx-webhook"
                placeholder="https://yourcompany.bitrix24.ru/rest/1/xxxxxxxxxxxxxxxx/"
                value={webhookUrl}
                onChange={e => setWebhookUrl(e.target.value)}
              />
              <p className="text-[11.5px]" style={{ color: 'var(--ink-4)' }}>
                Создаётся в Битрикс24: Настройки → Разработчикам → Другое → Входящий вебхук.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="amo-subdomain">Поддомен amoCRM</Label>
                <Input id="amo-subdomain" placeholder="company" value={subdomain} onChange={e => setSubdomain(e.target.value)} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="amo-token">Долгосрочный токен доступа</Label>
                <Input id="amo-token" type="password" placeholder="eyJ0eXAiOi..." value={accessToken} onChange={e => setAccessToken(e.target.value)} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" onClick={save} disabled={savePending}>
              {savePending ? <Loader2 size={14} className="animate-spin" /> : null}
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CardShell>
  )
}

export function IntegrationsClient({ data }: { data: IntegrationsData }) {
  const refresh = () => {
    // Простая перезагрузка страницы после мутации — данные шифруются и
    // маскируются на сервере, клиенту нечего мержить локально.
    window.location.reload()
  }

  const bitrix24 = data.connections.find(c => c.provider === 'bitrix24')!
  const amocrm = data.connections.find(c => c.provider === 'amocrm')!

  return (
    <div className="flex flex-col gap-4 p-4 md:p-8">
      <header>
        <p className="kicker">Система</p>
        <h1 className="block-title span-rule">Интеграции</h1>
        <p className="mt-2 max-w-xl text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
          Подключение CRM к внешним системам: собственный товароучёт, Bitrix24 и amoCRM.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <InventoryCard inventory={data.inventory} />
        <ExternalProviderCard
          provider="bitrix24"
          title="Bitrix24"
          connection={bitrix24}
          events={data.events}
          onSave={vals => saveBitrix24Connection(vals.webhookUrl)}
          onSaved={refresh}
        />
        <ExternalProviderCard
          provider="amocrm"
          title="amoCRM"
          connection={amocrm}
          events={data.events}
          onSave={vals => saveAmoCrmConnection({ subdomain: vals.subdomain, accessToken: vals.accessToken })}
          onSaved={refresh}
        />
      </div>
    </div>
  )
}

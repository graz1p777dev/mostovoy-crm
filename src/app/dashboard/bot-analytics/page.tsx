import { getShopBotOverview } from '@/actions/mostovoy-crm'
import { ShopApiError } from '@/components/shop/ShopApiError'

export const dynamic = 'force-dynamic'

function Metric({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-2xl bg-white px-5 py-4 shadow-sm">
      <p className="text-3xl font-bold" style={{ color: accent ? '#e11d1d' : '#1b1517' }}>{value.toLocaleString('ru-RU')}</p>
      <p className="mt-1 text-xs" style={{ color: '#6b6063' }}>{label}</p>
    </div>
  )
}

export default async function BotAnalyticsPage() {
  const result = await getShopBotOverview()
  if (!result.ok) return <ShopApiError error={result.error} />

  const { status, usage } = result.data
  const overview = usage.overview
  const customers = usage.customers ?? {
    total: overview.conversations,
    newToday: 0,
    activeToday: 0,
    active7d: 0,
    returning: 0,
    telegram: 0,
    whatsapp: 0,
    instagram: 0,
  }
  const channelTotal = Math.max(1, customers.telegram + customers.whatsapp + customers.instagram)
  const periods = [
    ['Сегодня', usage.periods.today],
    ['Среднее за день', usage.periods.averageDay],
    ['За 30 дней', usage.periods.month],
    ['За год', usage.periods.year],
    ['За всё время', usage.periods.all],
  ] as const

  return (
    <main className="p-4 md:p-8 space-y-5">
      <section
        className="rounded-3xl p-6 text-white shadow-[0_18px_44px_rgba(225,29,29,0.26)]"
        style={{ background: 'linear-gradient(135deg, #ff3045 0%, #ef1727 52%, #d90718 100%)' }}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/80">ИИ-менеджер магазина</p>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Аналитика бота</h1>
            <p className="mt-1 text-sm text-white/65">Живые данные из витрины и Telegram-бота.</p>
          </div>
          <span className="rounded-full px-3 py-1.5 text-xs font-semibold" style={{ background: status.enabled ? '#dcfce7' : '#fee2e2', color: status.enabled ? '#15803d' : '#b91c1c' }}>
            {status.enabled ? 'Бот подключён' : 'ИИ не настроен'}
          </span>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Диалогов" value={overview.conversations} />
        <Metric label="Сообщений клиентов и ответов" value={overview.messages} />
        <Metric label="Ответов ИИ" value={overview.aiReplies} accent />
        <Metric label="Ошибок за 24 часа" value={status.errors24h} />
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#e11d1d]">Клиенты</p>
            <h2 className="mt-1 text-lg font-bold text-[#1b1517]">Аналитика клиентов</h2>
          </div>
          <p className="text-xs text-[#6b6063]">Реальные диалоги Telegram, WhatsApp и Instagram</p>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Metric label="Всего клиентов" value={customers.total} accent />
          <Metric label="Новых сегодня" value={customers.newToday} />
          <Metric label="Активны сегодня" value={customers.activeToday} />
          <Metric label="Активны за 7 дней" value={customers.active7d} />
          <Metric label="Вернулись повторно" value={customers.returning} />
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {[
            ['Telegram', customers.telegram, '#229ED9'],
            ['WhatsApp', customers.whatsapp, '#22c55e'],
            ['Instagram', customers.instagram, '#ef1727'],
          ].map(([label, count, color]) => {
            const value = Number(count)
            const percent = Math.round(value / channelTotal * 100)
            return (
              <div key={String(label)} className="rounded-xl bg-[#faf8f7] p-4">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-semibold text-[#1b1517]">{label}</span>
                  <span className="text-[#6b6063]">{value.toLocaleString('ru-RU')} · {percent}%</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#eee9e9]">
                  <div className="h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: String(color) }} />
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold" style={{ color: '#1b1517' }}>Качество ответов</h2>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="Ожидают решения" value={status.approvals.pending} />
            <Metric label="Подтверждено" value={overview.approved} />
            <Metric label="Без правок" value={overview.withoutEdits} />
            <Metric label="Отклонено" value={overview.rejected} />
          </div>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold" style={{ color: '#1b1517' }}>Режим ответов</h2>
          <p className="mt-3 text-sm" style={{ color: '#6b6063' }}>
            {status.approvals.pending > 0
              ? `Есть ${status.approvals.pending} ответов, ожидающих подтверждения.`
              : 'Новых ответов, ожидающих подтверждения, нет.'}
          </p>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold" style={{ color: '#1b1517' }}>Расход ИИ</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {periods.map(([label, value]) => (
            <div key={label} className="rounded-xl p-4" style={{ backgroundColor: '#faf8f7' }}>
              <p className="text-lg font-bold" style={{ color: '#e11d1d' }}>{value.tokens.toLocaleString('ru-RU')} tok</p>
              <p className="mt-1 text-sm font-semibold" style={{ color: '#1b1517' }}>${value.costUsd.toFixed(value.costUsd >= 1 ? 2 : 4)}</p>
              <p className="mt-1 text-xs" style={{ color: '#6b6063' }}>{label}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}

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
  const periods = [
    ['Сегодня', usage.periods.today],
    ['Среднее за день', usage.periods.averageDay],
    ['За 30 дней', usage.periods.month],
    ['За год', usage.periods.year],
    ['За всё время', usage.periods.all],
  ] as const

  return (
    <main className="p-4 md:p-8 space-y-5">
      <section className="rounded-3xl bg-gradient-to-br from-[#ff2638] via-[#ed151f] to-[#c90816] p-6 text-white shadow-[0_18px_44px_rgba(225,29,29,0.24)]">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-200">ИИ-менеджер магазина</p>
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

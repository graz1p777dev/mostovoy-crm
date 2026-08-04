import Link from 'next/link'
import {
  AlertTriangle, Bell, BellRing, BotMessageSquare, CalendarClock, CircleDollarSign,
  Eye, FileText, ListChecks, MessageSquare, MousePointerClick, Newspaper,
  Package, SearchCheck, Tag, Target, TimerOff, UserCheck, Users,
} from 'lucide-react'
import { createTokenClient } from '@/lib/supabase/token-client'
import {
  getMonthKpiStats,
  getTaskSummary,
  getUnreadNotificationsCount,
} from '@/lib/dashboard-queries'
import { getShopAnalytics } from '@/actions/mostovoy-analytics'
import { getShopBotOverview } from '@/actions/mostovoy-crm'
import { getShopPosts } from '@/actions/mostovoy-posts'
import { getShopPriceHistory, getShopProducts } from '@/actions/mostovoy-products'
import { formatMoney, formatMoneyShort } from '@/lib/formatters'
import { CHART_TEXT } from '@/components/charts/chart-theme'
import EmptyState from '@/components/common/EmptyState'
import { ShopTrafficCharts, type TrafficDailyPoint } from './ShopTrafficCharts'

interface OpsSectionProps {
  dateStr: string
  year: number
  month: number
  role: string
  permissionLevel?: string
  employeeId?: string
  accessToken: string
}

const SOURCE_LABELS: Record<string, string> = {
  product: 'Карточка товара',
  cart: 'Корзина',
  credit: 'Рассрочка',
}

const CATALOG_STATUS_LABELS: Record<string, string> = {
  active: 'На витрине',
  needs_research: 'Нужно описание',
  hidden: 'Скрыт',
  sync_error: 'Ошибка синхронизации',
}

const PERIOD_DAYS = 30

function shortName(name: string) {
  return name.length > 22 ? `${name.slice(0, 21)}…` : name
}

function dayLabel(day: string) {
  const [, month, date] = day.split('-')
  return date && month ? `${date}.${month}` : day
}

export default async function OpsSection({
  dateStr,
  year,
  month,
  role,
  permissionLevel,
  employeeId,
  accessToken,
}: OpsSectionProps) {
  // Тот же token-клиент, что в Left/RightPanel: cookies() внутри Suspense
  // во время стриминга вызывать нельзя, а accessToken дальше в клиентские
  // компоненты не уходит — этот файл серверный и таким должен остаться.
  const supabase = createTokenClient(accessToken)

  const effectiveLevel =
    permissionLevel ??
    (role === 'mp' || role === 'lmai' ? 'employee' : role === 'rop' ? 'department_head' : 'owner')
  const filterById = effectiveLevel === 'employee' ? employeeId : undefined

  // Витрина и бот — то же право, что у пунктов меню «Аналитика магазина»,
  // «Маркетинг» и «Аналитика бота» в src/config/nav.ts: owner и rop.
  const canSeeShop = effectiveLevel === 'owner' || effectiveLevel === 'department_head'

  const [tasks, unread, kpi, analytics, products, posts, prices, bot] = await Promise.all([
    getTaskSummary(supabase, dateStr, employeeId),
    getUnreadNotificationsCount(supabase, employeeId),
    // Тот же запрос делает LeftPanel для KPI-карточек. Здесь он нужен под
    // другой вопрос — «сколько процентов плана уже сделано», — а панели
    // стримятся независимыми Suspense-границами и общий кэш им не поделить.
    getMonthKpiStats(supabase, year, month, filterById),
    canSeeShop ? getShopAnalytics(PERIOD_DAYS) : null,
    canSeeShop ? getShopProducts() : null,
    canSeeShop ? getShopPosts() : null,
    canSeeShop ? getShopPriceHistory(8) : null,
    canSeeShop ? getShopBotOverview() : null,
  ])

  // ─── Производные величины для маркетинга (считаем на сервере) ───
  const shopData = analytics?.ok ? analytics.data : null
  const views = shopData?.views
  const shopError = analytics && !analytics.ok ? analytics.error : null

  const dailyByDay = new Map<string, TrafficDailyPoint>()
  for (const point of views?.trend ?? []) {
    dailyByDay.set(point.day, { day: point.day, 'Просмотры': point.views, 'Клики «Купить»': 0 })
  }
  for (const point of shopData?.trend ?? []) {
    const existing = dailyByDay.get(point.day)
    if (existing) existing['Клики «Купить»'] = point.clicks
    else dailyByDay.set(point.day, { day: point.day, 'Просмотры': 0, 'Клики «Купить»': point.clicks })
  }
  const daily = [...dailyByDay.values()]
    .sort((a, b) => a.day.localeCompare(b.day))
    .map((row) => ({ ...row, day: dayLabel(row.day) }))

  const topViews = (views?.topProducts ?? []).slice(0, 6).map((item) => ({
    name: shortName(item.productName),
    'Просмотры': item.views,
  }))

  const totalSourceClicks = (shopData?.sources ?? []).reduce((sum, item) => sum + item.clicks, 0)
  const sources = (shopData?.sources ?? []).map((item) => ({
    name: SOURCE_LABELS[item.source] ?? item.source,
    'Клики': item.clicks,
    share: totalSourceClicks === 0 ? 0 : Math.round((item.clicks / totalSourceClicks) * 100),
  }))

  const totalViews = views?.summary.views ?? 0
  const totalClicks = shopData?.summary.clicks ?? 0
  const conversion = totalViews > 0 ? (totalClicks / totalViews) * 100 : 0

  const catalogCounts = new Map<string, number>()
  for (const product of products?.ok ? products.data.products : []) {
    catalogCounts.set(product.status, (catalogCounts.get(product.status) ?? 0) + 1)
  }
  const shopPosts = posts?.ok ? posts.posts : []
  const published = shopPosts.filter((post) => post.status === 'published').length
  const drafts = shopPosts.filter((post) => post.status === 'draft').length
  const priceChanges = prices?.ok ? prices.changes : []
  const botData = bot?.ok ? bot.data : null

  return (
    <section className="flex flex-col gap-7 px-6 pb-10 pt-9">
      <div>
        <div className="kicker">Работа · за пределами итогов</div>
        <h2 className="block-title" style={{ marginTop: 7 }}>
          Менеджеру и маркетологу
        </h2>
        <p className="mt-2 max-w-2xl text-sm" style={{ color: 'var(--ink-3)' }}>
          Всё, что нужно в течение дня: задачи и план — из CRM, трафик витрины и бот — из магазина.
        </p>
      </div>

      {/* ═══ Менеджеру ═══ */}
      <BlockHeader
        icon={<UserCheck size={14} />}
        title="Менеджеру"
        hint="Что горит и насколько выполнен план месяца"
      />

      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <Tile
          icon={<ListChecks size={13} />}
          label="Открытых задач"
          value={tasks.active}
          color={CHART_TEXT.primary}
          href="/dashboard/tasks"
        />
        <Tile
          icon={<TimerOff size={13} />}
          label="Просрочено"
          value={tasks.overdue}
          color={tasks.overdue > 0 ? CHART_TEXT.negative : CHART_TEXT.neutral}
          href="/dashboard/tasks"
        />
        <Tile
          icon={<CalendarClock size={13} />}
          label="Срок сегодня"
          value={tasks.dueToday}
          color={CHART_TEXT.secondary}
          href="/dashboard/tasks"
        />
        <Tile
          icon={<Target size={13} />}
          label="Назначено на меня"
          value={tasks.mine}
          color={CHART_TEXT.positive}
          href="/dashboard/tasks"
        />
        <Tile
          icon={unread > 0 ? <BellRing size={13} /> : <Bell size={13} />}
          label="Непрочитанных уведомлений"
          value={unread}
          color={unread > 0 ? CHART_TEXT.primary : CHART_TEXT.neutral}
          href="/dashboard/notifications"
        />
      </div>

      {tasks.active === 0 && (
        <EmptyState
          icon={ListChecks}
          size="sm"
          title="Открытых задач нет"
          hint="Задачи появятся здесь, как только их создадут на доске «Задачи»."
        />
      )}

      {/* План месяца */}
      <Card title={`Выполнение плана · ${monthName(month)}`}>
        {kpi.plan_fv === 0 && kpi.plan_sales === 0 && kpi.plan_revenue === 0 ? (
          <EmptyState
            icon={Target}
            size="sm"
            title="План на месяц не выставлен"
            hint="Заполните декомпозицию — прогресс появится здесь автоматически."
          />
        ) : (
          <div className="flex flex-col gap-4">
            <PlanBar label="Первичные визиты" fact={kpi.fv} plan={kpi.plan_fv} />
            <PlanBar label="Продажи" fact={kpi.sales} plan={kpi.plan_sales} />
            <PlanBar
              label="Выручка"
              fact={kpi.revenue}
              plan={kpi.plan_revenue}
              format={(value) => formatMoney(value)}
            />
          </div>
        )}
      </Card>

      {/* Бот и диалоги — из витрины */}
      {canSeeShop && (
        <>
          <BlockHeader
            icon={<BotMessageSquare size={14} />}
            title="Бот и диалоги"
            hint="Данные бота магазина: сколько ждёт менеджера и во что обошёлся ИИ"
          />
          {botData ? (
            <>
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
                <Tile
                  icon={<Users size={13} />}
                  label="Диалогов всего"
                  value={botData.usage.overview.conversations}
                  color={CHART_TEXT.primary}
                />
                <Tile
                  icon={<MessageSquare size={13} />}
                  label="Сообщений"
                  value={botData.usage.overview.messages}
                  color={CHART_TEXT.secondary}
                />
                <Tile
                  icon={<BotMessageSquare size={13} />}
                  label="Ответов ИИ"
                  value={botData.usage.overview.aiReplies}
                  color={CHART_TEXT.positive}
                />
                <Tile
                  icon={<UserCheck size={13} />}
                  label="Ждут подтверждения"
                  value={botData.status.approvals.pending}
                  color={botData.status.approvals.pending > 0 ? CHART_TEXT.negative : CHART_TEXT.neutral}
                />
                <Tile
                  icon={<AlertTriangle size={13} />}
                  label="Ошибок за 24 часа"
                  value={botData.status.errors24h}
                  color={botData.status.errors24h > 0 ? CHART_TEXT.negative : CHART_TEXT.neutral}
                />
                <Tile
                  icon={<CircleDollarSign size={13} />}
                  label={`Расход ИИ · ${PERIOD_DAYS} дн.`}
                  text={`$${botData.usage.periods.month.costUsd.toFixed(2)}`}
                  color={CHART_TEXT.neutral}
                />
              </div>
              {!botData.status.enabled && (
                <Notice>
                  У витрины не настроен ни один ключ ИИ — бот принимает сообщения, но не отвечает.
                  Модель и промпты можно проверить в «Настройках бота».
                </Notice>
              )}
              {botData.usage.overview.conversations === 0 && (
                <EmptyState
                  icon={MessageSquare}
                  size="sm"
                  title="Диалогов с ботом ещё не было"
                  hint="Первое обращение в Telegram или WhatsApp появится здесь вместе с ответом ИИ."
                />
              )}
            </>
          ) : (
            <Notice>{bot && !bot.ok ? bot.error : 'Состояние бота недоступно'}</Notice>
          )}
        </>
      )}

      {/* ═══ Маркетологу ═══ */}
      {canSeeShop && (
        <>
          <BlockHeader
            icon={<Eye size={14} />}
            title="Маркетологу"
            hint={`Трафик витрины «МОСТОВОЙ» за ${PERIOD_DAYS} дней`}
          />

          {shopError ? (
            <Notice>{shopError}</Notice>
          ) : (
            <>
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
                <Tile
                  icon={<Eye size={13} />}
                  label="Просмотров карточек"
                  value={totalViews}
                  color={CHART_TEXT.secondary}
                  href="/dashboard/shop-analytics"
                />
                <Tile
                  icon={<Users size={13} />}
                  label="Смотрели человек"
                  value={views?.summary.visitors ?? 0}
                  color={CHART_TEXT.primary}
                  href="/dashboard/shop-analytics"
                />
                <Tile
                  icon={<MousePointerClick size={13} />}
                  label="Кликов «Купить»"
                  value={totalClicks}
                  color={CHART_TEXT.positive}
                  href="/dashboard/shop-analytics"
                />
                <Tile
                  icon={<Target size={13} />}
                  label="Просмотр → клик"
                  text={totalViews > 0 ? `${conversion.toFixed(conversion >= 10 ? 0 : 1)}%` : '—'}
                  color={CHART_TEXT.neutral}
                  href="/dashboard/shop-analytics"
                />
              </div>

              {daily.length === 0 && topViews.length === 0 && sources.length === 0 ? (
                <EmptyState
                  icon={Eye}
                  size="sm"
                  title={`За ${PERIOD_DAYS} дней витрина не зафиксировала ни просмотров, ни кликов`}
                  hint="Как только на сайте начнут смотреть карточки, здесь появятся графики по дням, топ товаров и источники."
                />
              ) : (
                <ShopTrafficCharts daily={daily} topViews={topViews} sources={sources} />
              )}

              <div className="grid gap-3 xl:grid-cols-2">
                {/* Состояние каталога */}
                <Card title="Каталог витрины">
                  {products?.ok && products.data.products.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      {(['active', 'needs_research', 'hidden', 'sync_error'] as const).map((status) => (
                        <Row
                          key={status}
                          icon={
                            status === 'active' ? <Package size={13} />
                              : status === 'needs_research' ? <SearchCheck size={13} />
                                : status === 'hidden' ? <FileText size={13} />
                                  : <AlertTriangle size={13} />
                          }
                          label={CATALOG_STATUS_LABELS[status]}
                          value={catalogCounts.get(status) ?? 0}
                          color={
                            status === 'active' ? CHART_TEXT.positive
                              : status === 'needs_research' ? CHART_TEXT.secondary
                                : status === 'sync_error' ? CHART_TEXT.negative
                                  : CHART_TEXT.neutral
                          }
                        />
                      ))}
                      <div style={{ borderTop: '1px solid var(--line)' }} className="mt-1 pt-2" />
                      <Row
                        icon={<Newspaper size={13} />}
                        label="Постов опубликовано"
                        value={published}
                        color={CHART_TEXT.primary}
                      />
                      <Row
                        icon={<Newspaper size={13} />}
                        label="Черновиков постов"
                        value={drafts}
                        color={CHART_TEXT.neutral}
                      />
                      <Link
                        href="/dashboard/products"
                        className="mt-1 text-[11px] underline decoration-dotted underline-offset-2"
                        style={{ color: 'var(--brand-ink)' }}
                      >
                        Открыть каталог
                      </Link>
                    </div>
                  ) : (
                    <EmptyState
                      icon={Package}
                      size="sm"
                      title="Каталог витрины пуст"
                      hint={products && !products.ok ? products.error : 'Товары появятся здесь после первой синхронизации.'}
                    />
                  )}
                </Card>

                {/* Изменения цен */}
                <Card title="Последние изменения цен">
                  {priceChanges.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      {priceChanges.map((change) => {
                        const up = change.oldPrice !== null && change.newPrice > change.oldPrice
                        const down = change.oldPrice !== null && change.newPrice < change.oldPrice
                        return (
                          <div key={change.id} className="flex items-baseline justify-between gap-3">
                            <span className="min-w-0 flex-1 truncate text-xs" style={{ color: 'var(--ink)' }}>
                              <Tag size={11} className="mr-1.5 inline-block" style={{ color: 'var(--ink-4)' }} />
                              {change.productName}
                            </span>
                            <span className="shrink-0 text-xs tabular-nums" style={{ color: 'var(--ink-3)' }}>
                              {change.oldPrice === null
                                ? 'новая цена'
                                : `${formatMoneyShort(change.oldPrice)} →`}{' '}
                              <span
                                className="font-semibold"
                                style={{
                                  color: up ? CHART_TEXT.negative : down ? CHART_TEXT.positive : 'var(--ink)',
                                }}
                              >
                                {formatMoneyShort(change.newPrice)} {change.currency}
                              </span>
                            </span>
                          </div>
                        )
                      })}
                      <Link
                        href="/dashboard/shop-updates"
                        className="mt-1 text-[11px] underline decoration-dotted underline-offset-2"
                        style={{ color: 'var(--brand-ink)' }}
                      >
                        Все обновления
                      </Link>
                    </div>
                  ) : (
                    <EmptyState
                      icon={Tag}
                      size="sm"
                      title="Цены пока не менялись"
                      hint={prices && !prices.ok ? prices.error : 'Каждая правка цены — из бота или из CRM — попадёт в этот список.'}
                    />
                  )}
                </Card>
              </div>
            </>
          )}
        </>
      )}
    </section>
  )
}

// ─── Оформление ──────────────────────────────────────────────────────────────

function monthName(month: number) {
  return new Date(2000, month - 1, 1).toLocaleString('ru-RU', { month: 'long' })
}

function BlockHeader({
  icon, title, hint,
}: {
  icon: React.ReactNode
  title: string
  hint: string
}) {
  return (
    <div className="flex items-baseline gap-3 span-rule">
      <h3 className="flex items-center gap-2 text-base font-bold" style={{ color: 'var(--ink)' }}>
        <span style={{ color: 'var(--brand-ink)' }}>{icon}</span>
        {title}
      </h3>
      <span className="text-xs" style={{ color: 'var(--ink-3)' }}>{hint}</span>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white p-5" style={{ border: '1px solid var(--line)' }}>
      <p className="mb-3.5 text-sm font-semibold" style={{ color: 'var(--ink)' }}>{title}</p>
      {children}
    </div>
  )
}

/** Плитка-число. Либо value (число), либо готовый text — например «$0.00» или «12%». */
function Tile({
  icon, label, value, text, color, href,
}: {
  icon: React.ReactNode
  label: string
  value?: number
  text?: string
  color: string
  href?: string
}) {
  const body = (
    <>
      <div className="flex items-center gap-1.5 text-xl font-bold" style={{ color }}>
        {icon}
        {text ?? (value ?? 0).toLocaleString('ru-RU')}
      </div>
      <div className="mt-0.5 text-xs" style={{ color: 'var(--ink-3)' }}>{label}</div>
    </>
  )

  if (href) {
    return (
      <Link
        href={href}
        className="card-hover block rounded-2xl bg-white px-4 py-3.5"
        style={{ border: '1px solid var(--line)' }}
      >
        {body}
      </Link>
    )
  }
  return (
    <div className="rounded-2xl bg-white px-4 py-3.5" style={{ border: '1px solid var(--line)' }}>
      {body}
    </div>
  )
}

function Row({
  icon, label, value, color,
}: {
  icon: React.ReactNode
  label: string
  value: number
  color: string
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-xs" style={{ color: 'var(--ink-2)' }}>
        <span style={{ color: 'var(--ink-4)' }}>{icon}</span>
        {label}
      </span>
      <span className="text-sm font-semibold tabular-nums" style={{ color }}>
        {value.toLocaleString('ru-RU')}
      </span>
    </div>
  )
}

function PlanBar({
  label, fact, plan, format,
}: {
  label: string
  fact: number
  plan: number
  format?: (value: number) => string
}) {
  const show = format ?? ((value: number) => value.toLocaleString('ru-RU'))
  const pct = plan > 0 ? Math.min(100, (fact / plan) * 100) : 0
  const done = plan > 0 && fact >= plan

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-xs" style={{ color: 'var(--ink-2)' }}>{label}</span>
        <span className="text-xs tabular-nums" style={{ color: 'var(--ink-3)' }}>
          <span className="font-semibold" style={{ color: 'var(--ink)' }}>{show(fact)}</span>
          {' из '}
          {plan > 0 ? show(plan) : '—'}
          {plan > 0 && (
            <span className="ml-1.5 font-semibold" style={{ color: done ? CHART_TEXT.positive : CHART_TEXT.primary }}>
              {Math.round(pct)}%
            </span>
          )}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full" style={{ background: 'var(--surface-3)' }}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: done ? 'var(--ok-deep-2)' : 'linear-gradient(90deg, var(--brand), var(--accent-to))',
          }}
        />
      </div>
    </div>
  )
}

/** Витрина недоступна или бот не настроен — говорим об этом плашкой, а не пустотой. */
function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="flex items-start gap-2 rounded-2xl px-4 py-3 text-xs"
      style={{ background: 'var(--brand-soft)', color: 'var(--brand-ink)' }}
    >
      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
      {children}
    </p>
  )
}

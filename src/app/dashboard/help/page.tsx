'use client'

import Link from 'next/link'
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  FlaskConical,
  HelpCircle,
  MessageCircle,
  Send,
  Settings2,
  Users,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { NAV_GROUPS } from '@/config/nav'
import { HELP_CONTENT } from '@/config/help-content'
import type { UserRole } from '@/types'

const navy = 'var(--ink)'
const steel = 'var(--ink-25)'

export default function HelpPage() {
  const { user } = useAuth()
  const role = user?.role as UserRole | undefined

  // Показываем только то, что доступно этой роли — ровно как в боковом меню.
  // Саму «Помощь» из списка убираем, чтобы страница не ссылалась на себя.
  const groups = NAV_GROUPS.map((group) => ({
    label: group.label,
    items: group.items.filter(
      (item) => item.href !== '/dashboard/help' && role && item.roles.includes(role)
    ),
  })).filter((group) => group.items.length > 0)

  return (
    <div className="p-4 md:p-8 flex flex-col gap-6 max-w-5xl">
      {/* Шапка */}
      <div className="flex items-start gap-3">
        <div className="flex items-center justify-center w-11 h-11 rounded-2xl shrink-0" style={{ backgroundColor: 'var(--brand)' }}>
          <HelpCircle size={22} color="var(--on-brand)" />
        </div>
        <div>
          <h1 className="font-bold text-xl" style={{ color: navy }}>Помощь</h1>
          <p className="text-sm mt-0.5" style={{ color: steel }}>
            Что умеет каждый раздел и как туда перейти. Показаны только доступные вам разделы.
          </p>
        </div>
      </div>

      <section className="rounded-2xl bg-white p-5 md:p-6" style={{ border: '1px solid var(--surface-3)' }}>
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: 'var(--paper)' }}>
            <Bot size={20} color="var(--brand)" />
          </div>
          <div>
            <h2 className="font-bold text-lg" style={{ color: navy }}>Как работает AI-бот</h2>
            <p className="mt-1 text-sm leading-relaxed" style={{ color: 'var(--ink-2)' }}>
              Бот витрины отвечает клиентам сам. Если в «Настройках бота» включено «Подтверждать ответы перед отправкой»,
              каждый черновик сначала ждёт решения менеджера в разделе «Ответы бота» — клиент получит сообщение только после подтверждения.
              Если подтверждение выключено, бот отвечает сразу, и раздел остаётся пустым.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-5">
          {[
            { icon: MessageCircle, title: '1. Сообщение клиента', text: 'Клиент пишет боту в Telegram — сообщение попадает в «Диалоги».' },
            { icon: Bot, title: '2. Черновик AI', text: 'Бот учитывает историю диалога и актуальный каталог витрины.' },
            { icon: ClipboardCheck, title: '3. Согласование', text: 'При включённом подтверждении черновик ждёт в «Ответах бота».' },
            { icon: CheckCircle2, title: '4. Решение менеджера', text: 'Текст можно поправить и подтвердить либо отклонить с причиной.' },
            { icon: Send, title: '5. Отправка', text: 'Ответ уходит клиенту в Telegram и появляется в диалоге.' },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-xl p-4" style={{ backgroundColor: 'var(--paper-2)', border: '1px solid var(--paper)' }}>
              <Icon size={18} color="var(--brand)" />
              <p className="mt-2 text-sm font-semibold" style={{ color: navy }}>{title}</p>
              <p className="mt-1 text-xs leading-relaxed" style={{ color: steel }}>{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl bg-white p-5" style={{ border: '1px solid var(--surface-3)' }}>
          <h2 className="font-bold" style={{ color: navy }}>Что есть в карточке согласования</h2>
          <div className="mt-4 grid gap-3 text-sm">
            {[
              ['Сообщение клиента', 'Что именно написал человек — рядом с черновиком, чтобы не переключаться в «Диалоги».'],
              ['Пересказ гипервизора', 'Короткая выжимка диалога от отдельной модели: с чего начали и к чему пришли.'],
              ['Поле черновика', 'Текст ответа можно править прямо здесь — отправится то, что осталось в поле.'],
              ['Подтвердить и отправить', 'Отправляет текущий текст клиенту. Статус меняется только после успешной отправки: если Telegram вернул ошибку, черновик останется ждать.'],
              ['Отклонить черновик', 'Клиенту ничего не уходит. Причину можно указать — она сохраняется в примеры для обучения бота.'],
            ].map(([title, text]) => (
              <div key={title} className="flex gap-3">
                <span className="min-w-36 font-semibold" style={{ color: 'var(--brand)' }}>{title}</span>
                <p style={{ color: 'var(--ink-2)' }}>{text}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-5" style={{ border: '1px solid var(--surface-3)' }}>
          <h2 className="font-bold" style={{ color: navy }}>Где смотреть работу бота в CRM</h2>
          <div className="mt-4 grid gap-4 text-sm">
            <div className="flex gap-3"><MessageCircle size={18} className="shrink-0" color="var(--brand)" /><p style={{ color: 'var(--ink-2)' }}><b style={{ color: navy }}>Диалоги</b> — история переписки, сообщения клиента, AI-черновики и уже отправленные ответы.</p></div>
            <div className="flex gap-3"><ClipboardCheck size={18} className="shrink-0" color="var(--brand)" /><p style={{ color: 'var(--ink-2)' }}><b style={{ color: navy }}>Аналитика и отчёты бота</b> — расход токенов и денег по периодам и задачам, лента событий витрины и ошибки за сутки.</p></div>
            <div className="flex gap-3"><Settings2 size={18} className="shrink-0" color="var(--brand)" /><p style={{ color: 'var(--ink-2)' }}><b style={{ color: navy }}>Настройки бота</b> — подтверждение ответов, агрессивное обучение, модель и пять промптов: системный, гипервизора, характера, правил и задачи. Меняйте их только если понимаете эффект.</p></div>
            <div className="flex gap-3"><FlaskConical size={18} className="shrink-0" color="var(--brand)" /><p style={{ color: 'var(--ink-2)' }}><b style={{ color: navy }}>Лаборатория</b> — тестовый чат с ботом: сообщения никуда не уходят и диалог в CRM не создаётся.</p></div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl p-5" style={{ backgroundColor: 'var(--warn-tint-3)', border: '1px solid var(--warn-border-3)' }}>
        <div className="flex gap-3">
          <AlertTriangle size={20} className="mt-0.5 shrink-0" color="var(--warn-ink-2)" />
          <div>
            <h2 className="font-bold" style={{ color: navy }}>Если ответ не ушёл клиенту</h2>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed" style={{ color: 'var(--ink-2)' }}>
              <li>Статус меняется только после успешной отправки. Черновик остался в ожидании — значит Telegram отказал, и точный текст ошибки виден во всплывающем сообщении.</li>
              <li>Нажмите «Подтвердить и отправить» ещё раз: повторится именно этот черновик, второй не создаётся.</li>
              <li>Если не помогло — откройте «Отчёты бота»: там лента событий витрины и ошибки за сутки.</li>
              <li>Карточка вообще не появилась — проверьте, включено ли «Подтверждать ответы перед отправкой» в настройках бота и не выключен ли ИИ у этого клиента в «Диалогах».</li>
            </ol>
          </div>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-5 md:p-6" style={{ border: '1px solid var(--surface-3)' }}>
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: 'var(--paper-2)' }}>
            <BarChart3 size={20} color="var(--brand)" />
          </div>
          <div>
            <h2 className="font-bold text-lg" style={{ color: navy }}>Как читать главный дашборд</h2>
            <p className="mt-1 text-sm leading-relaxed" style={{ color: 'var(--ink-2)' }}>
              Главная страница — это не место для ввода данных, а короткая сводка. Она автоматически считает показатели из записей, продаж, финансов и расписания, доступных вашей роли.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--paper-2)', border: '1px solid var(--paper)' }}>
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--ink-25)' }}>Слева · итоги месяца</p>
            <div className="mt-3 space-y-3 text-sm" style={{ color: 'var(--ink-2)' }}>
              <p><b style={{ color: navy }}>Первичные встречи (ФВ)</b> — сколько первых встреч проведено за текущий месяц и насколько выполнен план.</p>
              <p><b style={{ color: navy }}>Продажи</b> — количество закрытых продаж за месяц.</p>
              <p><b style={{ color: navy }}>Выручка</b> — сумма продаж, которые внесены в систему.</p>
              <p><b style={{ color: navy }}>KPI%</b> — общий процент выполнения плана. Цвет и процент помогают быстро увидеть отставание или выполнение.</p>
              <p><b style={{ color: navy }}>Выручка по неделям</b> — график темпа продаж внутри месяца; по нему видно, в какие недели был рост или спад.</p>
              <p><b style={{ color: navy }}>План vs факт</b> — у владельца и РОПа сравнение по команде, у сотрудника — только его личные цифры.</p>
            </div>
          </div>

          <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--paper-2)', border: '1px solid var(--paper)' }}>
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--ink-25)' }}>Справа · сегодня</p>
            <div className="mt-3 space-y-3 text-sm" style={{ color: 'var(--ink-2)' }}>
              <p><b style={{ color: navy }}>ФВ сегодня и продажи сегодня</b> — только события текущего дня, не итог месяца.</p>
              <p><b style={{ color: navy }}>Выручка сегодня</b> появляется, когда в сегодняшних продажах есть сумма.</p>
              <p><b style={{ color: navy }}>Записи · лента</b> обновляется автоматически при новой записи: показывает клиента, статус, менеджера, сумму и время.</p>
              <p><b style={{ color: navy }}>Команда сейчас</b> видна руководителю: кто работает и какие показатели у команды сегодня.</p>
              <p><b style={{ color: navy }}>Расписание дня</b> — ближайшие события дня по времени.</p>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Link href="/dashboard/finance" className="rounded-xl p-4 transition-shadow hover:shadow-md" style={{ border: '1px solid var(--surface-3)' }}>
            <BarChart3 size={18} color="var(--brand)" />
            <p className="mt-2 text-sm font-semibold" style={{ color: navy }}>Нужно понять деньги?</p>
            <p className="mt-1 text-xs" style={{ color: steel }}>Откройте «Финансы» для движения денег, счетов и детальных операций.</p>
          </Link>
          <Link href="/dashboard/employees" className="rounded-xl p-4 transition-shadow hover:shadow-md" style={{ border: '1px solid var(--surface-3)' }}>
            <Users size={18} color="var(--brand)" />
            <p className="mt-2 text-sm font-semibold" style={{ color: navy }}>Нужно увидеть команду?</p>
            <p className="mt-1 text-xs" style={{ color: steel }}>Откройте «Сотрудники» — там роли, данные и доступы пользователей.</p>
          </Link>
        </div>
      </section>

      {groups.map((group) => (
        <div key={group.label} className="flex flex-col gap-3">
          <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--ink-3)' }}>
            {group.label}
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {group.items.map((item) => {
              const help = HELP_CONTENT[item.href]
              const Icon = item.icon
              const external = item.href.startsWith('/inventory')
              const cardInner = (
                <div className="flex items-start gap-3 rounded-2xl bg-white p-5 h-full transition-shadow hover:shadow-md">
                  <div className="flex items-center justify-center w-9 h-9 rounded-xl shrink-0" style={{ backgroundColor: 'var(--paper-2)' }}>
                    <Icon size={17} color="var(--brand)" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-sm" style={{ color: navy }}>{item.label}</span>
                      {external ? (
                        <ExternalLink size={13} color={steel} />
                      ) : (
                        <ArrowRight size={13} color={steel} />
                      )}
                    </div>
                    <p className="mt-1 text-sm" style={{ color: 'var(--ink-2)' }}>
                      {help?.summary ?? 'Раздел системы.'}
                    </p>
                    {help?.details && (
                      <p className="mt-1.5 text-xs leading-relaxed" style={{ color: steel }}>
                        {help.details}
                      </p>
                    )}
                    <span className="mt-2 inline-block text-xs font-medium" style={{ color: 'var(--brand)' }}>
                      Открыть →
                    </span>
                  </div>
                </div>
              )
              // Товароучёт — отдельная зона Multi-Zones, нужен hard navigation.
              return external ? (
                <a key={item.href} href={item.href}>{cardInner}</a>
              ) : (
                <Link key={item.href} href={item.href}>{cardInner}</Link>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

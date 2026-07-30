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

const navy = '#1b1517'
const steel = '#6b6063'

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
        <div className="flex items-center justify-center w-11 h-11 rounded-2xl shrink-0" style={{ backgroundColor: '#e11d1d' }}>
          <HelpCircle size={22} color="#fff" />
        </div>
        <div>
          <h1 className="font-bold text-xl" style={{ color: navy }}>Помощь</h1>
          <p className="text-sm mt-0.5" style={{ color: steel }}>
            Что умеет каждый раздел и как туда перейти. Показаны только доступные вам разделы.
          </p>
        </div>
      </div>

      <section className="rounded-2xl bg-white p-5 md:p-6" style={{ border: '1px solid #f0eaea' }}>
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: '#faf8f7' }}>
            <Bot size={20} color="#e11d1d" />
          </div>
          <div>
            <h2 className="font-bold text-lg" style={{ color: navy }}>Как работает AI-бот</h2>
            <p className="mt-1 text-sm leading-relaxed" style={{ color: '#574d4f' }}>
              Бот не отправляет клиенту текст сам по себе: каждый AI-ответ сначала приходит менеджерам на согласование в Telegram.
              Клиент получит сообщение только после нажатия «Принять».
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-5">
          {[
            { icon: MessageCircle, title: '1. Сообщение клиента', text: 'amoCRM передаёт сообщение боту.' },
            { icon: Bot, title: '2. Черновик AI', text: 'Бот учитывает историю диалога и готовит ответ.' },
            { icon: ClipboardCheck, title: '3. Согласование', text: 'Карточка с ответом приходит менеджерам в Telegram.' },
            { icon: CheckCircle2, title: '4. Решение менеджера', text: 'Ответ можно принять, изменить, сохранить или отклонить.' },
            { icon: Send, title: '5. Отправка', text: 'После принятия сообщение уходит клиенту в amoCRM и появляется в диалоге.' },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-xl p-4" style={{ backgroundColor: '#fdfbfb', border: '1px solid #faf8f7' }}>
              <Icon size={18} color="#e11d1d" />
              <p className="mt-2 text-sm font-semibold" style={{ color: navy }}>{title}</p>
              <p className="mt-1 text-xs leading-relaxed" style={{ color: steel }}>{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl bg-white p-5" style={{ border: '1px solid #f0eaea' }}>
          <h2 className="font-bold" style={{ color: navy }}>Кнопки в карточке согласования</h2>
          <div className="mt-4 grid gap-3 text-sm">
            {[
              ['✅ Принять', 'Отправляет текущий текст клиенту. После успешной отправки карточка покажет «Отправлено».'],
              ['✏️ Редактировать / 💬 Ответить', 'Позволяют изменить ответ перед отправкой. Используйте, если хотите написать текст сами.'],
              ['❌ Отклонить', 'Не отправляет черновик клиенту.'],
              ['💾 Сохранить', 'Сохраняет ответ как пример для обучения, но не отправляет его.'],
              ['🌐 Перевести', 'Создаёт вариант ответа на нужном языке — перед отправкой его можно проверить.'],
              ['🔁 Повторить отправку', 'Появляется только при ошибке отправки. Повторяет именно этот ответ, а не создаёт новый черновик.'],
            ].map(([title, text]) => (
              <div key={title} className="flex gap-3">
                <span className="min-w-36 font-semibold" style={{ color: '#e11d1d' }}>{title}</span>
                <p style={{ color: '#574d4f' }}>{text}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-5" style={{ border: '1px solid #f0eaea' }}>
          <h2 className="font-bold" style={{ color: navy }}>Где смотреть работу бота в CRM</h2>
          <div className="mt-4 grid gap-4 text-sm">
            <div className="flex gap-3"><MessageCircle size={18} className="shrink-0" color="#e11d1d" /><p style={{ color: '#574d4f' }}><b style={{ color: navy }}>Диалоги</b> — история переписки, сообщения клиента, AI-черновики и уже отправленные ответы.</p></div>
            <div className="flex gap-3"><ClipboardCheck size={18} className="shrink-0" color="#e11d1d" /><p style={{ color: '#574d4f' }}><b style={{ color: navy }}>Аналитика и отчёты бота</b> — количество входящих сообщений, согласований, отправок, отклонений и ежедневная сводка.</p></div>
            <div className="flex gap-3"><Settings2 size={18} className="shrink-0" color="#e11d1d" /><p style={{ color: '#574d4f' }}><b style={{ color: navy }}>Настройки бота</b> — промпт, модель, менеджеры, стоп-слова и чёрный список. Меняйте их только если понимаете эффект.</p></div>
            <div className="flex gap-3"><FlaskConical size={18} className="shrink-0" color="#e11d1d" /><p style={{ color: '#574d4f' }}><b style={{ color: navy }}>Лаборатория</b> — безопасно проверяет ответы на тестовых клиентах. Тестовые сообщения не уходят настоящим людям и не меняют amoCRM.</p></div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl p-5" style={{ backgroundColor: '#fff8e8', border: '1px solid #f4dfad' }}>
        <div className="flex gap-3">
          <AlertTriangle size={20} className="mt-0.5 shrink-0" color="#b7791f" />
          <div>
            <h2 className="font-bold" style={{ color: navy }}>Если ответ не ушёл клиенту</h2>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed" style={{ color: '#574d4f' }}>
              <li>Смотрите текст на карточке: «Отправлено» означает, что amoCRM подтвердил отправку.</li>
              <li>Если написано «Не отправлено», нажмите «Повторить отправку». Не создавайте второй ответ вручную, пока не проверите карточку.</li>
              <li>Если повтор не помог, откройте «Диалоги» и сообщите владельцу номер AI-ответа из карточки — он сможет посмотреть техническую причину в логах.</li>
              <li>Если карточка вообще не появилась, проверьте, включён ли AI у лида, и нет ли сообщения в стоп-словах или чёрном списке.</li>
            </ol>
          </div>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-5 md:p-6" style={{ border: '1px solid #f0eaea' }}>
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: '#fdfbfb' }}>
            <BarChart3 size={20} color="#e11d1d" />
          </div>
          <div>
            <h2 className="font-bold text-lg" style={{ color: navy }}>Как читать главный дашборд</h2>
            <p className="mt-1 text-sm leading-relaxed" style={{ color: '#574d4f' }}>
              Главная страница — это не место для ввода данных, а короткая сводка. Она автоматически считает показатели из записей, продаж, финансов и расписания, доступных вашей роли.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl p-4" style={{ backgroundColor: '#fdfbfb', border: '1px solid #faf8f7' }}>
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: '#6b6063' }}>Слева · итоги месяца</p>
            <div className="mt-3 space-y-3 text-sm" style={{ color: '#574d4f' }}>
              <p><b style={{ color: navy }}>Первичные встречи (ФВ)</b> — сколько первых встреч проведено за текущий месяц и насколько выполнен план.</p>
              <p><b style={{ color: navy }}>Продажи</b> — количество закрытых продаж за месяц.</p>
              <p><b style={{ color: navy }}>Выручка</b> — сумма продаж, которые внесены в систему.</p>
              <p><b style={{ color: navy }}>KPI%</b> — общий процент выполнения плана. Цвет и процент помогают быстро увидеть отставание или выполнение.</p>
              <p><b style={{ color: navy }}>Выручка по неделям</b> — график темпа продаж внутри месяца; по нему видно, в какие недели был рост или спад.</p>
              <p><b style={{ color: navy }}>План vs факт</b> — у владельца и РОПа сравнение по команде, у сотрудника — только его личные цифры.</p>
            </div>
          </div>

          <div className="rounded-xl p-4" style={{ backgroundColor: '#fdfbfb', border: '1px solid #faf8f7' }}>
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: '#6b6063' }}>Справа · сегодня</p>
            <div className="mt-3 space-y-3 text-sm" style={{ color: '#574d4f' }}>
              <p><b style={{ color: navy }}>ФВ сегодня и продажи сегодня</b> — только события текущего дня, не итог месяца.</p>
              <p><b style={{ color: navy }}>Выручка сегодня</b> появляется, когда в сегодняшних продажах есть сумма.</p>
              <p><b style={{ color: navy }}>Записи · лента</b> обновляется автоматически при новой записи: показывает клиента, статус, менеджера, сумму и время.</p>
              <p><b style={{ color: navy }}>Команда сейчас</b> видна руководителю: кто работает и какие показатели у команды сегодня.</p>
              <p><b style={{ color: navy }}>Расписание дня</b> — ближайшие события дня по времени.</p>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Link href="/dashboard/finance" className="rounded-xl p-4 transition-shadow hover:shadow-md" style={{ border: '1px solid #f0eaea' }}>
            <BarChart3 size={18} color="#e11d1d" />
            <p className="mt-2 text-sm font-semibold" style={{ color: navy }}>Нужно понять деньги?</p>
            <p className="mt-1 text-xs" style={{ color: steel }}>Откройте «Финансы» для движения денег, счетов и детальных операций.</p>
          </Link>
          <Link href="/dashboard/employees" className="rounded-xl p-4 transition-shadow hover:shadow-md" style={{ border: '1px solid #f0eaea' }}>
            <Users size={18} color="#e11d1d" />
            <p className="mt-2 text-sm font-semibold" style={{ color: navy }}>Нужно увидеть команду?</p>
            <p className="mt-1 text-xs" style={{ color: steel }}>Откройте «Сотрудники» — там роли, данные и доступы пользователей.</p>
          </Link>
        </div>
      </section>

      {groups.map((group) => (
        <div key={group.label} className="flex flex-col gap-3">
          <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: '#7d7174' }}>
            {group.label}
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {group.items.map((item) => {
              const help = HELP_CONTENT[item.href]
              const Icon = item.icon
              const external = item.href.startsWith('/inventory')
              const cardInner = (
                <div className="flex items-start gap-3 rounded-2xl bg-white p-5 h-full transition-shadow hover:shadow-md">
                  <div className="flex items-center justify-center w-9 h-9 rounded-xl shrink-0" style={{ backgroundColor: '#fdfbfb' }}>
                    <Icon size={17} color="#e11d1d" />
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
                    <p className="mt-1 text-sm" style={{ color: '#574d4f' }}>
                      {help?.summary ?? 'Раздел системы.'}
                    </p>
                    {help?.details && (
                      <p className="mt-1.5 text-xs leading-relaxed" style={{ color: steel }}>
                        {help.details}
                      </p>
                    )}
                    <span className="mt-2 inline-block text-xs font-medium" style={{ color: '#e11d1d' }}>
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

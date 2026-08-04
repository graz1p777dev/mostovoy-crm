import type { LucideIcon } from 'lucide-react'
import type { UserRole } from '@/types'
import { FinanceNavIcon } from '@/components/finance/FinanceDesignerIcons'

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  roles: UserRole[]
  exact?: boolean
  requiresBotApproval?: boolean
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

import {
  LayoutDashboard,
  BarChart3,
  Megaphone,
  DollarSign,
  Users,
  Calendar,
  Bell,
  FileText,
  Settings,
  FileBarChart2,
  SlidersHorizontal,
  HelpCircle,
  KanbanSquare,
  Sparkles,
  ShoppingBag,
  ShoppingCart,
  Newspaper,
  Eye,
  Handshake,
  MessageSquareCheck,
  TrendingUp,
  CalendarCheck,
  Clock,
  Plug,
} from 'lucide-react'

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Главное',
    items: [
      {
        href: '/dashboard',
        label: 'Дашборд',
        icon: LayoutDashboard,
        roles: ['owner', 'rop', 'mp', 'lmai'],
        exact: true,
      },
      {
        // Воронка продаж. Сделки заводятся сами, как только клиент написал
        // боту витрины или в WhatsApp/Instagram — бухгалтеру не нужна.
        href: '/dashboard/deals',
        label: 'Сделки',
        icon: Handshake,
        roles: ['owner', 'rop', 'mp', 'lmai'],
      },
      {
        href: '/dashboard/orders',
        label: 'Заказы',
        icon: ShoppingCart,
        roles: ['owner', 'rop', 'mp', 'lmai'],
      },
      {
        href: '/dashboard/copilot',
        label: 'ИИ-помощник',
        icon: Sparkles,
        roles: ['owner', 'rop', 'mp', 'lmai', 'accountant'],
      },
    ],
  },
  {
    label: 'AI Бот',
    items: [
      {
        href: '/dashboard/bot-analytics',
        label: 'Аналитика бота',
        icon: BarChart3,
        roles: ['owner', 'rop'],
      },
      {
        href: '/dashboard/bot-reports',
        label: 'Отчёты бота',
        icon: FileBarChart2,
        roles: ['owner', 'rop'],
        requiresBotApproval: true,
      },
      {
        href: '/dashboard/bot-approvals',
        label: 'Подтверждение ответов',
        icon: MessageSquareCheck,
        roles: ['owner', 'rop'],
        requiresBotApproval: true,
      },
      {
        href: '/dashboard/bot-settings',
        label: 'Настройки бота',
        icon: SlidersHorizontal,
        roles: ['owner'],
      },
    ],
  },
  {
    // Витрина mostovoy: товары, новости и аналитика магазина. Данные живут в
    // отдельном сервисе (Express + SQLite), CRM работает с ним через его админ-API.
    label: 'Интернет магазин',
    items: [
      {
        href: '/dashboard/products',
        label: 'Товары',
        icon: ShoppingBag,
        roles: ['owner', 'rop'],
      },
      {
        href: '/dashboard/posts',
        label: 'Посты',
        icon: Newspaper,
        roles: ['owner', 'rop'],
      },
      {
        href: '/dashboard/shop-analytics',
        label: 'Аналитика магазина',
        icon: Eye,
        roles: ['owner', 'rop'],
      },
      {
        // Журнал цен витрины: что и откуда подорожало или подешевело.
        href: '/dashboard/shop-updates',
        label: 'Обновления',
        icon: TrendingUp,
        roles: ['owner', 'rop'],
      },
    ],
  },
  {
    label: 'Аналитика',
    items: [
      {
        href: '/dashboard/decomposition',
        label: 'Декомпозиция',
        icon: BarChart3,
        roles: ['owner', 'rop', 'mp', 'lmai'],
      },
      {
        href: '/dashboard/salary',
        label: 'Зарплата',
        icon: DollarSign,
        roles: ['owner', 'rop', 'mp', 'lmai', 'accountant'],
      },
      {
        href: '/dashboard/finance',
        label: 'Финансы',
        icon: FinanceNavIcon,
        roles: ['owner', 'accountant'],
      },
      {
        href: '/dashboard/marketing',
        label: 'Маркетинг',
        icon: Megaphone,
        roles: ['owner', 'rop'],
      },
    ],
  },
  {
    label: 'Управление',
    items: [
      {
        href: '/dashboard/tasks',
        label: 'Задачи',
        icon: KanbanSquare,
        roles: ['owner', 'rop', 'mp', 'lmai', 'accountant'],
      },
      {
        href: '/dashboard/employees',
        label: 'Сотрудники',
        icon: Users,
        roles: ['owner', 'rop'],
      },
      {
        // Реестр партнёров-источников клиентов: кто сколько привёл и с какой
        // конверсией. Ведут его владелец и руководитель отдела.
        href: '/dashboard/partners',
        label: 'Партнёры',
        icon: Handshake,
        roles: ['owner', 'rop'],
      },
      {
        // Табель: приходы, опоздания, объяснительные, отпуска и больничные.
        href: '/dashboard/attendance',
        label: 'Посещаемость',
        icon: CalendarCheck,
        roles: ['owner', 'rop', 'accountant'],
      },
      {
        // Личный экран сотрудника: отметиться на смене и посмотреть свой месяц.
        // Владельцу и бухгалтеру не нужен — они смотрят общий табель.
        href: '/dashboard/my-time',
        label: 'Моё время',
        icon: Clock,
        roles: ['rop', 'mp', 'lmai'],
      },
      {
        href: '/dashboard/calendar',
        label: 'Календарь',
        icon: Calendar,
        roles: ['owner', 'rop', 'mp', 'lmai'],
      },
      {
        href: '/dashboard/notifications',
        label: 'Уведомления',
        icon: Bell,
        roles: ['owner', 'rop', 'mp', 'lmai', 'accountant'],
      },
      {
        href: '/dashboard/documents',
        label: 'Документы',
        icon: FileText,
        roles: ['owner', 'accountant', 'rop'],
      },
    ],
  },
  {
    label: 'Система',
    items: [
      {
        href: '/dashboard/settings',
        label: 'Настройки',
        icon: Settings,
        roles: ['owner'],
      },
      {
        href: '/dashboard/integrations',
        label: 'Интеграции',
        icon: Plug,
        roles: ['owner', 'rop'],
      },
      {
        href: '/dashboard/help',
        label: 'Помощь',
        icon: HelpCircle,
        roles: ['owner', 'rop', 'mp', 'lmai', 'accountant'],
      },
    ],
  },
]

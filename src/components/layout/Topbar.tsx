'use client'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, useMemo } from 'react'
import { Bell, Menu, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { NAV_GROUPS } from '@/config/nav'
import { createClient } from '@/lib/supabase/client'
import { getInitials, formatDateFull } from '@/lib/formatters'
import { ROLE_LABELS } from '@/lib/constants'
import type { UserRole } from '@/types'
import { ProfileDialog } from '@/components/profile/ProfileDialog'

const STATIC_PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Дашборд',
  '/dashboard/decomposition': 'Декомпозиция',
  '/dashboard/salary': 'Зарплата',
  '/dashboard/finance': 'Финансы',
  '/dashboard/marketing': 'Маркетинг',
  '/dashboard/employees': 'Сотрудники',
  '/dashboard/calendar': 'Рабочий календарь',
  '/dashboard/notifications': 'Уведомления',
  '/dashboard/documents': 'Документы',
  '/dashboard/settings': 'Настройки',
}

const PAGE_TITLES: Record<string, string> = NAV_GROUPS
  .flatMap(group => group.items)
  .reduce<Record<string, string>>((acc, item) => {
    acc[item.href] = item.label
    return acc
  }, { ...STATIC_PAGE_TITLES })

function getPageTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname]
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length >= 3) {
    const base = '/' + segments.slice(0, 3).join('/')
    return PAGE_TITLES[base] ? PAGE_TITLES[base] + ' / Детали' : 'Страница'
  }
  return 'Страница'
}

function AskAiInput({ pathname }: { pathname: string }) {
  const router = useRouter()
  const [value, setValue] = useState('')

  const submit = () => {
    const text = value.trim()
    if (!text) return
    const params = new URLSearchParams({ q: text, context_path: pathname })
    router.push(`/dashboard/copilot?${params.toString()}`)
    setValue('')
  }

  return (
    <div className="relative w-full max-w-md">
      <Sparkles
        style={{ width: 14, height: 14, color: 'var(--ink-3)' }}
        className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
      />
      <input
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit() }}
        placeholder="Спросите ИИ-помощника…"
        className="w-full rounded-md outline-none transition-colors"
        style={{
          fontSize: 13,
          padding: '6px 10px 6px 28px',
          background: 'var(--surface-2)',
          border: '1px solid var(--line)',
          color: 'var(--ink)',
        }}
      />
    </div>
  )
}

export default function Topbar({ onMenuClick }: { onMenuClick?: () => void }) {
  const pathname = usePathname()
  const { user } = useAuth()
  const [unreadCount, setUnreadCount] = useState(0)
  const [profileOpen, setProfileOpen] = useState(false)
  const supabase = useMemo(() => createClient(), [])

  const role = user?.role as UserRole | undefined
  const today = formatDateFull(new Date().toISOString())

  useEffect(() => {
    if (!user?.id) return

    const fetchUnread = async () => {
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('employee_id', user.id)
        .eq('is_read', false)
      setUnreadCount(count ?? 0)
    }

    fetchUnread()

    const channel = supabase
      .channel('topbar-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `employee_id=eq.${user.id}`,
        },
        () => fetchUnread()
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user?.id, supabase])

  return (
    <header
      className="flex-shrink-0 flex items-center px-5 gap-4"
      style={{
        height: 52,
        backgroundColor: 'rgba(255,255,255,0.88)',
        backdropFilter: 'blur(16px) saturate(120%)',
        WebkitBackdropFilter: 'blur(16px) saturate(120%)',
        borderBottom: '1px solid var(--line)',
        boxShadow: '0 1px 2px rgba(28,20,22,0.04)',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}
    >
      {/* Гамбургер — только мобильный */}
      <button
        onClick={onMenuClick}
        className="md:hidden flex items-center justify-center rounded-md flex-shrink-0"
        style={{ width: 32, height: 32, color: 'var(--ink)' }}
        title="Меню"
        aria-label="Открыть меню"
      >
        <Menu style={{ width: 19, height: 19 }} />
      </button>

      {/* Хлебные крошки / поле ввода ИИ-помощника */}
      <div className={pathname.startsWith('/dashboard/copilot') ? 'flex-1 min-w-0' : 'flex-1 min-w-0 flex justify-center'}>
        {pathname.startsWith('/dashboard/copilot') ? (
          <h1
            className="font-semibold truncate"
            style={{ fontSize: 14, color: 'var(--ink)' }}
          >
            {getPageTitle(pathname)}
          </h1>
        ) : (
          <AskAiInput pathname={pathname} />
        )}
      </div>

      {/* Правая часть */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {/* Текущая страница */}
        {!pathname.startsWith('/dashboard/copilot') && (
          <span
            className="hidden sm:block font-medium truncate"
            style={{ fontSize: 12, color: 'var(--ink)', maxWidth: 220 }}
          >
            {getPageTitle(pathname)}
          </span>
        )}

        {/* Дата */}
        {today && (
          <span
            className="hidden sm:block"
            style={{ fontSize: 12, color: 'var(--ink-3)' }}
          >
            {today}
          </span>
        )}

        {/* Колокол */}
        <Link
          href="/dashboard/notifications"
          className="relative flex items-center justify-center rounded-md transition-colors"
          style={{ width: 32, height: 32, color: 'var(--ink-muted)' }}
          title="Уведомления"
        >
          <Bell style={{ width: 16, height: 16 }} />
          {unreadCount > 0 && (
            <span
              className="absolute flex items-center justify-center text-white font-bold"
              style={{
                top: 4, right: 4,
                minWidth: 14, height: 14,
                backgroundColor: 'var(--brand-ink)',
                borderRadius: 7,
                fontSize: 9,
                lineHeight: 1,
                padding: '0 3px',
              }}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Link>

        {/* Аватар пользователя — открывает профиль */}
        <button
          type="button"
          onClick={() => setProfileOpen(true)}
          className="flex items-center gap-2 rounded-lg px-1.5 py-1 -mx-1.5 transition-colors hover:bg-black/5"
          title={role ? `${ROLE_LABELS[role]} · открыть профиль` : 'Открыть профиль'}
        >
          <div
            className="flex items-center justify-center rounded-full text-white font-semibold flex-shrink-0 brand-gradient"
            style={{
              width: 28, height: 28,
              fontSize: 10,
            }}
          >
            {user?.name ? getInitials(user.name) : '??'}
          </div>
          <span
            className="hidden md:block font-medium"
            style={{ fontSize: 12, color: 'var(--ink)', maxWidth: 100 }}
          >
            {user?.name?.split(' ')[0] ?? ''}
          </span>
        </button>
      </div>

      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
    </header>
  )
}

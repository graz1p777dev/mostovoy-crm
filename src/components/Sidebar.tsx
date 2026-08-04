'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import { ROLE_LABELS } from '@/lib/constants'
import { getInitials } from '@/lib/formatters'
import { NAV_GROUPS } from '@/config/nav'
import { BRAND } from '@/config/brand'
import { LogOut } from 'lucide-react'
import type { UserRole } from '@/types'

function isActiveLink(pathname: string, href: string, exact?: boolean): boolean {
  if (exact) return pathname === href
  return pathname === href || pathname.startsWith(href + '/')
}

interface SidebarProps {
  mobileOpen?: boolean
  onClose?: () => void
  approvalEnabled?: boolean
}

export default function Sidebar({ mobileOpen = false, onClose, approvalEnabled = false }: SidebarProps) {
  const pathname = usePathname()
  const { user, signOut } = useAuth()
  const role = user?.role as UserRole | undefined

  // Десктоп: свёрнут до иконок, раскрывается по наведению или фокусу с клавиатуры.
  // Мобильный drawer всегда раскрыт целиком.
  const [hovered, setHovered] = useState(false)
  const expanded = mobileOpen || hovered

  // Скользящая подсветка активного пункта
  const itemRefs = useRef<Map<string, HTMLAnchorElement | null>>(new Map())
  const [indicator, setIndicator] = useState<{ top: number; height: number; visible: boolean }>({
    top: 0, height: 0, visible: false,
  })
  const [animate, setAnimate] = useState(false)

  const activeHref = (() => {
    for (const group of NAV_GROUPS) {
      for (const item of group.items) {
        if (role && item.roles.includes(role) && (!item.requiresBotApproval || approvalEnabled) && isActiveLink(pathname, item.href, item.exact)) {
          return item.href
        }
      }
    }
    return null
  })()

  useLayoutEffect(() => {
    const el = activeHref ? itemRefs.current.get(activeHref) : null
    if (el) {
      setIndicator({ top: el.offsetTop, height: el.offsetHeight, visible: true })
      // включаем плавность только после первой установки позиции
      const id = requestAnimationFrame(() => setAnimate(true))
      return () => cancelAnimationFrame(id)
    } else {
      setIndicator(prev => ({ ...prev, visible: false }))
    }
  }, [activeHref, role])

  // На мобильном: закрывать drawer при переходе на другую страницу
  useEffect(() => {
    onClose?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  return (
    <>
      {/* Панель fixed, поэтому отдельная колонка синхронно резервирует её ширину
          и сдвигает страницу при раскрытии на десктопе. */}
      <div
        aria-hidden
        className={cn(
          'hidden flex-shrink-0 transition-[width] duration-200 ease-out md:block',
          hovered ? 'w-48' : 'w-16',
        )}
      />

      <aside
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocusCapture={() => setHovered(true)}
        onBlurCapture={() => setHovered(false)}
        className={cn(
          'flex flex-col h-screen overflow-hidden',
          'fixed inset-y-0 left-0 z-50 transition-all duration-200 ease-out',
          'w-48 md:translate-x-0',
          hovered ? 'md:w-48 md:shadow-2xl' : 'md:w-16',
          mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full',
        )}
        style={{
          background: 'linear-gradient(180deg, var(--sidebar-from) 0%, var(--sidebar-to) 100%)',
          borderRight: '1px solid var(--sidebar-line)',
          boxShadow: '8px 0 28px -18px rgba(225,29,29,0.45)',
        }}
      >
      {/* Логотип */}
      <div
        className="flex items-center gap-3 px-4 py-4 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.18)' }}
      >
        <div
          className="brand-mark flex-shrink-0"
          style={{ width: 32, height: 32 }}
          aria-hidden
        />
        <div
          className={cn(
            'min-w-0 transition-opacity duration-200',
            expanded ? 'opacity-100' : 'opacity-0',
          )}
        >
          <p className="font-semibold truncate whitespace-nowrap" style={{ fontSize: 13, color: 'var(--sidebar-fg)' }}>
            {BRAND.identity.name}
          </p>
          <p style={{ fontSize: 11, color: 'var(--sidebar-fg)' }} className="truncate whitespace-nowrap">
            {BRAND.identity.tagline}
          </p>
        </div>
      </div>

      {/* Навигация */}
      <nav className="flex-1 overflow-y-auto px-2 py-3" style={{ scrollbarWidth: 'none' }}>
        <div className="relative">
          {/* Скользящая подсветка */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: indicator.top,
              height: indicator.height,
              background: 'var(--sidebar-active-bg)',
              borderRadius: 8,
              boxShadow: '0 4px 14px -4px rgba(40,26,28,0.34), inset 0 0 0 1px rgba(255,255,255,0.9)',
              opacity: indicator.visible ? 1 : 0,
              transition: animate
                ? 'top 260ms cubic-bezier(0.22,1,0.36,1), height 260ms cubic-bezier(0.22,1,0.36,1), opacity 150ms ease'
                : 'opacity 150ms ease',
              pointerEvents: 'none',
              zIndex: 0,
            }}
          />
          {NAV_GROUPS.map((group) => {
            const visible = group.items.filter(
              (item) => role && item.roles.includes(role) && (!item.requiresBotApproval || approvalEnabled)
            )
            if (!visible.length) return null

            return (
              <div key={group.label} className="mb-5">
                <p
                  className={cn(
                    'px-2 mb-1 uppercase tracking-widest font-semibold truncate whitespace-nowrap',
                    'transition-opacity duration-200',
                    expanded ? 'opacity-100' : 'opacity-0',
                  )}
                  style={{ fontSize: 10, color: 'var(--sidebar-fg)' }}
                >
                  {group.label}
                </p>
                <ul className="space-y-0.5">
                  {visible.map((item) => {
                    const active = isActiveLink(pathname, item.href, item.exact)
                    const Icon = item.icon
                    const LinkTag = Link

                    return (
                      <li key={item.href}>
                        <LinkTag
                          ref={(el) => { itemRefs.current.set(item.href, el) }}
                          href={item.href}
                          title={expanded ? undefined : item.label}
                          className={cn(
                            'relative flex items-center gap-2.5 px-2.5 py-2 rounded-md transition-colors duration-150 outline-none',
                            active
                              ? 'text-[var(--sidebar-active-ink)] font-medium'
                              : 'text-[var(--sidebar-fg)] hover:bg-white/[0.14] hover:text-[var(--sidebar-fg)] focus-visible:bg-white/[0.14] focus-visible:text-[var(--sidebar-fg)]'
                          )}
                          style={{ zIndex: 1 }}
                        >
                          <span
                            className="relative flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-lg"
                            style={{
                              background: active ? 'rgba(200,20,20,0.10)' : 'rgba(255,255,255,0.16)',
                              boxShadow: 'none',
                            }}
                            aria-hidden
                          >
                            <span
                              aria-hidden
                              style={{
                                position: 'absolute',
                                right: -8,
                                top: -10,
                                width: 18,
                                height: 18,
                                borderRadius: 999,
                                backgroundColor: active ? 'rgba(200,20,20,0.08)' : 'rgba(255,255,255,0.10)',
                              }}
                            />
                            <Icon
                              style={{
                                position: 'relative',
                                width: 14,
                                height: 14,
                                color: active ? 'var(--sidebar-active-ink)' : 'var(--sidebar-fg)',
                                flexShrink: 0,
                              }}
                            />
                          </span>
                          <span
                            className={cn(
                              'truncate whitespace-nowrap transition-opacity duration-200',
                              expanded ? 'opacity-100' : 'opacity-0',
                            )}
                            style={{ fontSize: 13, fontWeight: active ? 500 : 400 }}
                          >
                            {item.label}
                          </span>
                        </LinkTag>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </div>
      </nav>

      {/* Пользователь */}
      <div
        className="flex-shrink-0 px-3 py-3"
        style={{ borderTop: '1px solid rgba(255,255,255,0.18)' }}
      >
        <div className="flex items-center gap-2.5">
          {/* Аватар */}
          <div
            className="flex items-center justify-center rounded-full flex-shrink-0 font-semibold brand-gradient"
            style={{
              width: 30, height: 30,
              fontSize: 11,
              color: 'var(--on-brand)',
            }}
          >
            {user?.name ? getInitials(user.name) : '??'}
          </div>

          {/* Имя и роль */}
          <div
            className={cn(
              'flex-1 min-w-0 transition-opacity duration-200',
              expanded ? 'opacity-100' : 'opacity-0',
            )}
          >
            <p className="font-medium truncate whitespace-nowrap" style={{ fontSize: 12, color: 'var(--sidebar-fg)' }}>
              {user?.name ?? 'Загрузка...'}
            </p>
            <p style={{ fontSize: 11, color: 'var(--sidebar-fg)' }} className="truncate whitespace-nowrap">
              {role ? ROLE_LABELS[role] : ''}
            </p>
          </div>

          {/* Выход */}
          <button
            onClick={() => signOut()}
            className={cn(
              'flex-shrink-0 transition-all duration-200',
              expanded ? 'opacity-100' : 'opacity-0 pointer-events-none',
            )}
            style={{ color: 'rgba(255,255,255,0.9)' }}
            title="Выйти"
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--sidebar-fg)'
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.9)'
            }}
          >
            <LogOut style={{ width: 15, height: 15 }} />
          </button>
        </div>
      </div>
      </aside>
    </>
  )
}

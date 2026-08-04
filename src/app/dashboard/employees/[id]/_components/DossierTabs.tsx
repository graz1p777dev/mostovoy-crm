// Навигация по вкладкам досье. Вкладка — параметр URL (?tab=...), а не состояние
// клиента: страница остаётся Server Component, и данные вкладки, на ресурс которой
// нет прав, не загружаются и не уходят в браузер вообще.
//
// Состав вкладок вычисляется на сервере (page.tsx) по правам на РЕСУРС каждой
// вкладки — сюда приходит уже готовый список `available`.

import Link from 'next/link'
import { BRAND } from './shared'

export type DossierTab = 'overview' | 'results' | 'attendance' | 'salary'

const TAB_LABELS: Record<DossierTab, string> = {
  overview:   'Обзор',
  results:    'Результаты',
  attendance: 'Посещаемость',
  salary:     'Зарплата',
}

/** Разделы-задел: показываем, чтобы структура досье была видна целиком, но кликать нечего. */
const SOON_TABS = ['Документы', 'Отпуска'] as const

/** Нормализация ?tab= из URL. Значение, которого нет в списке доступных
 *  (нет права на ресурс вкладки, либо мусор в URL), → «Обзор».
 *  Это и есть fail-closed для подобранного вручную адреса. */
export function resolveTab(raw: string | undefined, available: DossierTab[]): DossierTab {
  if (raw === 'results' || raw === 'attendance' || raw === 'salary' || raw === 'overview') {
    return available.includes(raw) ? raw : 'overview'
  }
  return 'overview'
}

export function DossierTabs({ employeeId, active, available }: {
  employeeId: string
  active: DossierTab
  available: DossierTab[]
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-1.5 rounded-2xl px-3 py-2.5"
      style={{ backgroundColor: BRAND.card, border: `1px solid ${BRAND.divider}` }}
    >
      {available.map(tab => {
        const isActive = tab === active
        return (
          <Link
            key={tab}
            href={`/dashboard/employees/${employeeId}?tab=${tab}`}
            scroll={false}
            aria-current={isActive ? 'page' : undefined}
            className="px-3 py-1.5 rounded-xl text-xs font-medium transition-colors"
            // Белый текст кладём на --accent-deep: на светлом конце фирменного
            // градиента (var(--accent-to)) он даёт всего 2.84:1 и читается плохо.
            style={isActive
              ? { backgroundColor: 'var(--accent-deep)', color: 'var(--on-brand)' }
              : { backgroundColor: BRAND.bg, color: BRAND.text, border: `1px solid ${BRAND.divider}` }}
          >
            {TAB_LABELS[tab]}
          </Link>
        )
      })}

      {SOON_TABS.map(label => (
        <span
          key={label}
          aria-disabled="true"
          title="Раздел в разработке"
          className="px-3 py-1.5 rounded-xl text-xs font-medium inline-flex items-center gap-1.5 cursor-default select-none"
          style={{ backgroundColor: BRAND.bg, color: BRAND.muted }}
        >
          {label}
          <span
            className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide"
            style={{ backgroundColor: BRAND.surface, color: BRAND.muted }}
          >
            Скоро
          </span>
        </span>
      ))}
    </div>
  )
}

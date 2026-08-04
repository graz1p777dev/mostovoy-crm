import type { CSSProperties } from 'react'
import { BRAND } from '@/config/brand'

// Категориальная палитра графиков. Значения приходят из бренд-конфига
// (BRAND.charts / BRAND.chartText) — перекраска под клиента правит только его.
//
// Здесь намеренно остаются literal-значения, а не var(--…): Recharts не
// резолвит CSS-переменные в stop-color градиентов на всех рендерерах, а часть
// цветов уходит в SVG-атрибуты. Поэтому цвет берётся из конфига как строка.
//
// Правило подбора палитры описано в самом конфиге: серии обязаны отличаться
// и по тону, и по светлоте. Ключи названы по роли, а не по цвету — сменить
// палитру можно, не переписывая графики.

export const CHART_COLORS = BRAND.charts

export const CHART_PALETTE = [
  CHART_COLORS.primary,
  CHART_COLORS.secondary,
  CHART_COLORS.positive,
  CHART_COLORS.negative,
  CHART_COLORS.neutral,
  CHART_COLORS.soft,
]

// Цвета серий подобраны для заливок и линий — как текст часть из них не
// читается (золото даёт 2.1:1 на белом). Поэтому для подписей, чисел в
// таблицах и легенд берём затемнённые двойники того же тона.
export const CHART_TEXT = BRAND.chartText

export const CHART_TICK = { fontSize: 11, fill: 'var(--chart-tick)' }
export const CHART_MARGIN = { top: 4, right: 4, left: -16, bottom: 0 }

// Подсказка светлая: под ней белая бумага, тёмный тултип бил бы по глазам.
export const CHART_TOOLTIP_STYLE: CSSProperties = {
  background: 'rgba(255,255,255,0.97)',
  backdropFilter: 'blur(10px)',
  border: '1px solid var(--line)',
  borderRadius: 10,
  fontSize: 12,
  color: 'var(--ink)',
  boxShadow: '0 12px 32px -12px rgba(28,20,22,0.18)',
}

export const CHART_GRID_STROKE = 'rgba(27,21,23,0.07)'

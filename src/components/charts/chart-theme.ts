import type { CSSProperties } from 'react'

// Категориальная палитра графиков. Recharts не резолвит CSS-переменные в
// stop-color градиентов на всех рендерерах, поэтому держим литералы,
// синхронизированные с --chart-1..5 в globals.css.
//
// Правило подбора: серии обязаны отличаться и по тону, и по светлоте —
// «все оттенки красного» нечитаемы. Тёплое ядро (красный, золото, рыжий)
// разбавлено одним холодным контрапунктом — глубоким зелёным. Бордовых и
// винных тонов нет: глубину даём рыжим и графитом, а не затемнением красного.
//
// Ключи названы по роли, а не по цвету: сменить палитру можно, не переписывая
// графики.
//                              тон  светлота
export const CHART_COLORS = {
  primary: '#e11d1d', //     0°   50%  — главная серия: выручка, факт, баланс
  secondary: '#f0a52a', //    38°   55%  — вторая серия: обращения, ROMI, показы
  positive: '#2f7d64', //   163°   34%  — план, прибыль (холодный контрапункт)
  negative: '#b5491f', //    17°   42%  — расходы, убыток
  neutral: '#7d7174', //   350°   47%  — прочее, вспомогательные линии
  soft: '#ffa8b0', //   355°   83%  — светлый акцент, дальние доли
} as const

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
// таблицах и легенд берём затемнённые двойники того же тона: все ≥ 6:1.
export const CHART_TEXT = {
  primary: '#c01818',
  secondary: '#92400e',
  positive: '#2b6b56',
  negative: '#9a3c18',
  neutral: '#6b6063',
  soft: '#c01818',
} as const

export const CHART_TICK = { fontSize: 11, fill: '#8a7d80' }
export const CHART_MARGIN = { top: 4, right: 4, left: -16, bottom: 0 }

// Подсказка светлая: под ней белая бумага, тёмный тултип бил бы по глазам.
export const CHART_TOOLTIP_STYLE: CSSProperties = {
  background: 'rgba(255,255,255,0.97)',
  backdropFilter: 'blur(10px)',
  border: '1px solid #ece5e5',
  borderRadius: 10,
  fontSize: 12,
  color: '#1b1517',
  boxShadow: '0 12px 32px -12px rgba(28,20,22,0.18)',
}

export const CHART_GRID_STROKE = 'rgba(27,21,23,0.07)'

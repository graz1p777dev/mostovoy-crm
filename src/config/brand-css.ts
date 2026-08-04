// ============================================================================
// Генератор CSS-переменных из бренд-конфига.
//
// Токены НЕ дублируются в globals.css: там остались только правила, которые
// их потребляют. Единственное место, где задаются значения, — brand.ts.
// Результат вставляется в разметку в src/app/layout.tsx (серверный рендер,
// поэтому мигания нескорректированных цветов нет).
//
// Тёмная тема включается классом .dark на <html> (@custom-variant в globals.css).
// Акцент переключается атрибутом data-accent — блоки :root[data-accent='…']
// переопределяют только акцентные токены поверх базовых.
// ============================================================================

import {
  BRAND,
  DEFAULT_ACCENT_PRESET,
  type AccentPreset,
  type ThemeColors,
} from './brand'

/** Пара «имя переменной → значение» без префикса `--`. */
type Vars = Record<string, string>

/** Раскладывает набор цветов темы в плоский список CSS-переменных. */
function themeVars(t: ThemeColors): Vars {
  const n = t.neutral
  const b = t.brand

  const vars: Vars = {
    // Нейтральная шкала
    paper: n.paper,
    'paper-2': n.paperHi,
    surface: n.surface,
    'surface-2': n.surface2,
    'surface-3': n.surface3,
    line: n.line,
    'line-soft': n.lineSoft,
    'line-mid': n.lineMid,
    'line-strong': n.lineStrong,
    ink: n.ink,
    'ink-2': n.ink2,
    'ink-25': n.ink25,
    'ink-3': n.ink3,
    'ink-4': n.ink4,
    'ink-muted': n.inkMuted,

    // Фирменная шкала
    brand: b.base,
    'brand-strong': b.strong,
    'brand-ink': b.ink,
    'brand-soft': b.soft,
    'brand-tint': b.tint,
  }

  // Сигнальные шкалы. Историческое имя без суффикса (--ok, --warn, --bad,
  // --info) закреплено за ступенью `ink` — это цвет текста, им пользуются чаще
  // всего.
  for (const key of ['ok', 'warn', 'bad', 'info'] as const) {
    const r = t[key]
    vars[key] = r.ink
    vars[`${key}-tint`] = r.tint
    vars[`${key}-soft`] = r.soft
    vars[`${key}-soft-alt`] = r.softAlt
    vars[`${key}-border`] = r.border
    vars[`${key}-base`] = r.base
    vars[`${key}-strong`] = r.strong
  }

  // Токены shadcn/ui и служебные цвета — ключи уже совпадают с именами переменных.
  Object.assign(vars, t.shadcn, t.misc)

  return vars
}

/** Акцентные переменные пресета — то, что переключается в Настройках. */
function accentVars(a: AccentPreset): Vars {
  return {
    'accent-from': a.from,
    'accent-to': a.to,
    'accent-deep': a.deep,
    'accent-shadow': a.shadow,
    // Акцент обязан утянуть за собой и токены shadcn, иначе кнопки
    // компонентов ui/ останутся прежнего цвета.
    primary: `oklch(${a.oklch})`,
    ring: `oklch(${a.oklch} / 50%)`,
    'sidebar-primary': `oklch(${a.oklch})`,
    'sidebar-ring': `oklch(${a.oklch} / 50%)`,
  }
}

/** Переменные, не зависящие от светлой/тёмной темы. */
function staticVars(): Vars {
  const s = BRAND.sidebar
  const term = BRAND.terminal

  const vars: Vars = {
    radius: BRAND.radius,
    'on-brand': BRAND.onBrand,

    // Круглый фирменный знак
    'brand-mark-image': `url('${BRAND.mark.image}')`,
    'brand-mark-position': BRAND.mark.position,
    'brand-mark-size': BRAND.mark.size,
    'brand-mark-fallback': BRAND.mark.fallback,
    'brand-mark-shadow': BRAND.mark.shadow,
    'brand-mark-shadow-lg': BRAND.mark.shadowLarge,
    'brand-focus-ring': BRAND.mark.focusRing,
    'brand-stream-glow': BRAND.mark.streamGlow,

    // Сайдбар
    'sidebar-from': s.from,
    'sidebar-to': s.to,
    'sidebar-fg': s.foreground,
    'sidebar-active-bg': s.activeBg,
    'sidebar-active-ink': s.activeInk,
    'sidebar-line': s.border,

    // Тёмная консоль журнала событий
    'term-bg': term.bg,
    'term-border': term.border,
    'term-text': term.text,
    'term-muted': term.muted,
    'term-time': term.time,
    'term-stage': term.stage,
    'term-rule': term.rule,
    'term-info': term.info,
    'term-warn': term.warn,
    'term-error': term.error,
    'term-online': term.online,
    'term-status-success': term.statusSuccess,
    'term-status-error': term.statusError,
    'term-status-skipped': term.statusSkipped,
    'term-status-received': term.statusReceived,
    'term-status-dry-run': term.statusDryRun,
    'term-status-default': term.statusDefault,
  }

  // Осевшие оттенки — тему не различают (см. комментарий в brand.ts).
  Object.assign(vars, BRAND.drift)

  // Серии графиков — для CSS. В JS-компоненты они попадают напрямую из
  // конфига (см. components/charts/chart-theme.ts).
  for (const [k, v] of Object.entries(BRAND.charts)) vars[`series-${k}`] = v
  for (const [k, v] of Object.entries(BRAND.chartText)) vars[`series-${k}-text`] = v

  return vars
}

function block(selector: string, vars: Vars): string {
  const body = Object.entries(vars)
    .map(([k, v]) => `--${k}:${v}`)
    .join(';')
  return `${selector}{${body}}`
}

/**
 * Собирает весь CSS с определениями токенов.
 * Порядок важен: базовый :root → .dark → акцентные пресеты (они переопределяют
 * акцент поверх любой темы).
 */
export function buildBrandCss(): string {
  return [
    block(':root', { ...themeVars(BRAND.light), ...staticVars(), ...accentVars(DEFAULT_ACCENT_PRESET) }),
    block('.dark', themeVars(BRAND.dark)),
    ...BRAND.accents.map(a => block(`:root[data-accent='${a.id}']`, accentVars(a))),
  ].join('')
}

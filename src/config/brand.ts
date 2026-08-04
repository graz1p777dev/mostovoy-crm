// ============================================================================
// БРЕНД-КОНФИГ — единственный источник правды по фирменному стилю.
//
// Всё, что отличает одного клиента от другого, живёт здесь: название, логотип,
// шрифты, цветовые шкалы, палитра графиков, тёмная консоль и сайдбар.
// Компоненты НЕ содержат цветовых литералов — они читают CSS-переменные,
// которые генерируются из этого файла (см. brand-css.ts) и подставляются
// в разметку в src/app/layout.tsx.
//
// Чтобы перекрасить CRM под нового клиента — правится ТОЛЬКО этот файл.
// Пошаговая инструкция и разобранный пример: BRANDING.md в корне репозитория.
//
// Что обычно меняют: identity, fonts, accents, light.brand, light.neutral,
// charts, sidebar. Семантику (ok/warn/bad/info) менять как правило НЕ нужно:
// «успех» остаётся зелёным, «ошибка» — красной независимо от бренда. Её
// трогают только если фирменный цвет конфликтует с сигнальным (см. BRANDING.md).
// ============================================================================

import type { SansFontKey, DisplayFontKey } from './brand-fonts'

// ---------------------------------------------------------------------------
// Типы
// ---------------------------------------------------------------------------

/** Идентичность: как компания называется и чем помечается. */
export interface BrandIdentity {
  /** Полное название, выводится в сайдбаре и на экране загрузки. */
  name: string
  /** Короткая монограмма для круглой плашки-аватара. */
  shortName: string
  /** <title> документа. */
  title: string
  /** <meta name="description">. */
  description: string
  /** Подпись под названием в сайдбаре. */
  tagline: string
}

/**
 * Круглый фирменный знак (.brand-mark и экран загрузки).
 * Кадрирование вынесено в конфиг: у каждого логотипа своя «посадка» в круге.
 */
export interface BrandMark {
  /** Путь к файлу в /public. */
  image: string
  /** background-position — сдвиг картинки внутри круга. */
  position: string
  /** background-size — масштаб (>100% выводит круг за края блока). */
  size: string
  /** Заливка под картинкой — подстраховка, если файл не загрузится. */
  fallback: string
  /** Мягкая тень под знаком в сайдбаре. */
  shadow: string
  /** Тень под крупным знаком на экране загрузки. */
  shadowLarge: string
  /** Подсветка фокуса у полей ввода — фирменная, но сильно разбавленная. */
  focusRing: string
  /** Блик в углу ленты сообщений. */
  streamGlow: string
}

/**
 * Шрифты. Значения — ключи реестра в src/config/brand-fonts.ts.
 * next/font требует статических вызовов загрузчиков, поэтому здесь только
 * ключ, а сам вызов Inter()/Manrope() живёт в реестре.
 */
export interface BrandFonts {
  /** Основной текст → --font-sans. */
  sans: SansFontKey
  /** Заголовки и .font-display → --font-display. */
  display: DisplayFontKey
}

/**
 * Акцентный пресет — переключается пользователем в Настройках и хранится
 * в cookie устройства. Бренд-конфиг задаёт список и значение по умолчанию.
 */
export interface AccentPreset {
  id: string
  /** Подпись в панели выбора. */
  label: string
  /** Начало фирменного градиента. */
  from: string
  /** Конец градиента. Светлый — на нём НЕЛЬЗЯ ставить белый текст. */
  to: string
  /** Тёмный конец: заливки под белым текстом берут его, а не `to`. */
  deep: string
  /** Цвет мягкой тени под акцентными кнопками. */
  shadow: string
  /** Тот же акцент в oklch — для токенов shadcn (--primary, --ring, --sidebar-*). */
  oklch: string
}

/** Нейтральная шкала: бумага, поверхности, линии, текст. */
export interface NeutralRamp {
  /** Фон приложения. */
  paper: string
  /** Ещё светлее бумаги — подложка мягких карточек и полей. */
  paperHi: string
  /** Белая карточка. */
  surface: string
  /** Утопленная поверхность: поля ввода, зебра таблиц. */
  surface2: string
  /** Ещё глубже: заголовки таблиц, неактивные вкладки. */
  surface3: string
  /** Основная волосяная линия. */
  line: string
  /** Чуть светлее основной — рамки мягких блоков. */
  lineSoft: string
  /** Промежуточная — рамки полей ввода. */
  lineMid: string
  /** Заметная линия: разделители секций, пунктир пустых состояний. */
  lineStrong: string
  /** Основной текст. */
  ink: string
  /** Вторичный текст. */
  ink2: string
  /** Между вторичным и третичным — подписи, значения в таблицах. */
  ink25: string
  /** Третичный: мелкие подписи. Минимальный уровень контраста для текста. */
  ink3: string
  /** Только иконки и декор — для текста контраста не хватает. */
  ink4: string
  /**
   * Холодный серый, доставшийся от донорского приложения. Выбивается из
   * тёплой шкалы; сведение его к ink25 — осознанное визуальное изменение,
   * поэтому пока сохранён отдельным токеном. См. BRANDING.md.
   */
  inkMuted: string
}

/** Фирменная шкала — производная от акцента, но задаётся явно. */
export interface BrandRamp {
  /** Фирменный цвет. */
  base: string
  /** Тёмный конец: заливки под белым текстом. */
  strong: string
  /** Для мелкого фирменного текста — контраст выше, чем у base. */
  ink: string
  /** Мягкая заливка: бейджи, аватары, подсветка строк. */
  soft: string
  /** Ещё легче — фон-намёк. */
  tint: string
}

/**
 * Сигнальная шкала одного смысла (успех / внимание / ошибка / информация).
 * Ступени идут от самой светлой заливки к самому тёмному тексту.
 */
export interface SemanticRamp {
  /** Самая светлая заливка — фон блока. */
  tint: string
  /** Мягкая заливка — фон бейджа. */
  soft: string
  /** Альтернативная мягкая заливка (историческая, чуть теплее soft). */
  softAlt: string
  /** Рамка бейджа. */
  border: string
  /** Насыщенный цвет — точки, индикаторы, заливки. */
  base: string
  /** Текст на светлой заливке. */
  ink: string
  /** Тёмный текст — на soft-заливке. */
  strong: string
}

/** Палитра графиков. Ключи по роли, а не по цвету. */
export interface ChartPalette {
  primary: string
  secondary: string
  positive: string
  negative: string
  neutral: string
  soft: string
}

/**
 * Сайдбар. Вынесен в конфиг целиком: у МОСТОВОГО это сплошная фирменная
 * плашка, но клиент со светлым сайдбаром выражается теми же токенами —
 * достаточно задать светлые from/to и тёмный foreground.
 */
export interface SidebarTheme {
  /** Верх заливки. */
  from: string
  /** Низ заливки. */
  to: string
  /** Текст и иконки. */
  foreground: string
  /** Заливка активного пункта. */
  activeBg: string
  /** Текст активного пункта — читается на activeBg. */
  activeInk: string
  /** Разделители внутри сайдбара. */
  border: string
  /** Тот же фон в oklch — для токенов shadcn --sidebar / --sidebar-primary. */
  oklch: string
}

/**
 * Тёмная консоль журнала событий (/dashboard/bot-reports).
 * Единственная намеренно тёмная плашка в интерфейсе: журнал должен выглядеть
 * как консоль. Вынесена в конфиг, чтобы клиент мог сделать её светлой.
 */
export interface TerminalTheme {
  bg: string
  border: string
  text: string
  muted: string
  time: string
  /** Метка этапа. */
  stage: string
  /** Горизонтальная линейка между записями. */
  rule: string
  /** Цвета уровней журнала. */
  info: string
  warn: string
  error: string
  /** Индикатор «бот на связи». */
  online: string
  /** Цвета статусов в ленте лаборатории — читаются на тёмном фоне консоли. */
  statusSuccess: string
  statusError: string
  statusSkipped: string
  statusReceived: string
  statusDryRun: string
  statusDefault: string
}

/** Полный бренд-конфиг. */
export interface BrandConfig {
  identity: BrandIdentity
  mark: BrandMark
  fonts: BrandFonts
  /** id пресета по умолчанию — должен существовать в accents. */
  defaultAccent: string
  accents: readonly AccentPreset[]
  light: ThemeColors
  dark: ThemeColors
  /**
   * Осевшие оттенки. Копились по мере роста кода: где-то взяли соседнюю
   * ступень Tailwind, где-то подобрали цвет на глаз. Сведены в токены, чтобы
   * перекраска не оставляла в интерфейсе чужие пятна.
   *
   * Тему не различают — в разметке это были литералы, одинаковые в светлой
   * и тёмной. Для нового клиента их обычно достаточно свести к основным
   * ступеням шкал, но это осознанное визуальное изменение, а не механическая
   * замена. См. раздел «Осевшие оттенки» в BRANDING.md.
   */
  drift: Record<string, string>
  charts: ChartPalette
  /**
   * Затемнённые двойники серий для подписей и чисел: цвета заливок как текст
   * не читаются (золото даёт 2.1:1 на белом). Все ступени ≥ 4.5:1 на бумаге.
   */
  chartText: ChartPalette
  sidebar: SidebarTheme
  terminal: TerminalTheme
  /** Базовый радиус: от него производятся все остальные (--radius-sm…4xl). */
  radius: string
  /**
   * Текст и иконки поверх фирменной заливки (кнопки, бейджи, сайдбар).
   * Отдельный токен, а не «белый»: у клиента со светлым акцентом читаемым
   * будет тёмный текст.
   */
  onBrand: string
}

/** Набор цветов одной темы (светлой или тёмной). */
export interface ThemeColors {
  neutral: NeutralRamp
  brand: BrandRamp
  ok: SemanticRamp
  warn: SemanticRamp
  bad: SemanticRamp
  info: SemanticRamp
  /** Токены shadcn/ui в oklch — не дублируют шкалы выше, а питают компоненты ui/. */
  shadcn: Record<string, string>
  /** Точечные служебные цвета, не попавшие в шкалы. */
  misc: Record<string, string>
}

// ---------------------------------------------------------------------------
// Конфигурация МОСТОВОГО — значения по умолчанию
// ---------------------------------------------------------------------------

/**
 * Акцентные пресеты. Обязаны совпадать по смыслу с панелью в Настройках:
 * пользователь переключает акцент в рантайме, бренд-конфиг задаёт лишь дефолт.
 *
 * Фиолетовый и розовый убраны — это палитра донорского приложения; вместо
 * них коралловый и графитовый, которые не спорят с фирменным красным.
 */
export const ACCENTS: readonly AccentPreset[] = [
  {
    id: 'mostovoy',
    label: 'Красный (Мостовой)',
    from: '#e11d1d',
    to: '#ff5c68',
    deep: '#cc1414',
    shadow: 'rgba(225, 29, 29, 0.35)',
    oklch: '0.55 0.21 27',
  },
  {
    id: 'coral',
    label: 'Коралловый',
    from: '#e2554d',
    to: '#ff8a7a',
    deep: '#bf3d34',
    shadow: 'rgba(226, 85, 77, 0.35)',
    oklch: '0.62 0.16 30',
  },
  {
    id: 'graphite',
    label: 'Графитовый',
    from: '#4a4042',
    to: '#776b6e',
    deep: '#3a3032',
    shadow: 'rgba(74, 64, 66, 0.35)',
    oklch: '0.36 0.01 25',
  },
  {
    // До вынесения в конфиг этот пресет был рассинхронизирован: образец
    // в Настройках показывал синий (#1d4ed8 → #3b82f6), а CSS применял
    // красный (#c01818 → #e11d1d) с синим только в `deep`. Единый источник
    // правды это расхождение снял — пресет стал действительно синим, как
    // и обещает образец и его тень rgba(29, 78, 216, …).
    id: 'blue',
    label: 'Синий',
    from: '#1d4ed8',
    to: '#3b82f6',
    deep: '#1a45bd',
    shadow: 'rgba(29, 78, 216, 0.35)',
    oklch: '0.48 0.2 264',
  },
  {
    id: 'emerald',
    label: 'Изумрудный',
    from: '#059669',
    to: '#10b981',
    deep: '#04815a',
    shadow: 'rgba(5, 150, 105, 0.35)',
    oklch: '0.62 0.15 165',
  },
  {
    id: 'amber',
    label: 'Янтарный',
    from: '#d97706',
    to: '#f59e0b',
    deep: '#b45309',
    shadow: 'rgba(217, 119, 6, 0.35)',
    oklch: '0.68 0.16 70',
  },
] as const

export const BRAND: BrandConfig = {
  identity: {
    name: 'МОСТОВОЙ',
    shortName: 'М',
    title: 'МОСТОВОЙ CRM',
    description: 'Система управления бизнесом',
    tagline: 'CRM система',
  },

  // Кадрирование как в витрине: масштаб 132% выводит круг за края блока,
  // позиция компенсирует смещение, border-radius обрезает лишнее.
  mark: {
    image: '/logo.webp',
    position: '49% 45.5%',
    size: '132%',
    fallback: '#e11d1d',
    shadow: '0 5px 16px rgba(225, 29, 29, 0.34)',
    shadowLarge: '0 16px 42px rgba(225, 29, 29, 0.3)',
    focusRing: '0 0 0 3px rgba(225, 29, 29, 0.10)',
    streamGlow: 'rgba(225, 29, 29, 0.05)',
  },

  // Заголовки — узкий технический гротеск: «приборная» интонация и экономия
  // ширины в плотных таблицах. Текст — Inter.
  fonts: {
    sans: 'inter',
    display: 'plex-condensed',
  },

  defaultAccent: 'mostovoy',
  accents: ACCENTS,

  // ---- Светлая тема -------------------------------------------------------
  light: {
    // Тёплая нейтральная шкала (оттенок ~20°, минимальная насыщенность).
    // Ни один тон не должен читаться голубовато-серым.
    // Контраст на белом указан в комментариях.
    neutral: {
      paper: '#faf8f7',
      paperHi: '#fdfbfb',
      surface: '#ffffff',
      surface2: '#f6f2f2',
      surface3: '#f0eaea',
      line: '#ece5e5',
      lineSoft: '#ebebee',
      lineMid: '#e8dfe0',
      lineStrong: '#ddd3d3',
      ink: '#1b1517', //     18.0:1
      ink2: '#574d4f', //     8.1:1
      ink25: '#6b6063', //    6.0:1
      ink3: '#7d7174', //     4.7:1 — минимум для мелкого текста
      ink4: '#a19698', //     2.9:1 — только иконки и декор
      inkMuted: '#6b7280', // холодный серый из донорского приложения
    },

    // Бренд. `ink` — для мелкого красного текста (7.4:1); сам акцент #e11d1d
    // даёт 4.78:1 и годится для крупного/полужирного.
    brand: {
      base: '#e11d1d',
      strong: '#cc1414',
      ink: '#c01818',
      soft: '#fdecec',
      tint: '#fff8f8',
    },

    // Семантика. Сигнальные цвета обязаны оставаться отличимыми от бренда:
    // danger отличается от фирменного красного светлотой (6.2:1 против 4.8:1),
    // а не уходом в вино. Бордовые/винные оттенки запрещены.
    ok: {
      tint: '#f0fdf4',
      soft: '#dcfce7',
      softAlt: '#e6f4ec',
      border: '#86efac',
      base: '#16a34a',
      ink: '#15803d',
      strong: '#166534',
    },
    warn: {
      tint: '#fffbeb',
      soft: '#fef3c7',
      softAlt: '#fff4e0',
      border: '#fcd34d',
      base: '#f59e0b',
      ink: '#b45309',
      strong: '#92400e',
    },
    bad: {
      tint: '#fef2f2',
      soft: '#fee2e2',
      softAlt: '#fdeaea',
      border: '#fca5a5',
      base: '#ef4444',
      ink: '#c01818',
      // Тёмная ступень остаётся чистым красным (тон 0°). Бордовые и винные
      // оттенки запрещены: глубину даём светлотой, а не уходом в вино.
      strong: '#a81616',
    },
    info: {
      tint: '#f0f9ff',
      soft: '#e4f4fd',
      softAlt: '#e0f2fe',
      border: '#7dd3fc',
      base: '#0ea5e9',
      ink: '#177fc0',
      strong: '#0369a1',
    },

    // Токены shadcn/ui. Держатся в oklch — так их задал генератор темы.
    shadcn: {
      background: 'oklch(0.985 0.003 30)',
      foreground: 'oklch(0.19 0.008 20)',
      card: 'oklch(1 0 0)',
      'card-foreground': 'oklch(0.19 0.008 20)',
      popover: 'oklch(1 0 0 / 97%)',
      'popover-foreground': 'oklch(0.19 0.008 20)',
      'primary-foreground': 'oklch(0.99 0 0)',
      secondary: 'oklch(0.965 0.005 25)',
      'secondary-foreground': 'oklch(0.32 0.01 22)',
      muted: 'oklch(0.965 0.005 25)',
      'muted-foreground': 'oklch(0.53 0.009 20)',
      accent: 'oklch(0.96 0.016 25)',
      'accent-foreground': 'oklch(0.4 0.13 27)',
      // Ошибка обязана оставаться отличимой от фирменного красного:
      // тот же тон, но заметно темнее и контрастнее. Не бордо.
      destructive: 'oklch(0.5 0.19 28)',
      border: 'oklch(0.22 0.01 20 / 9%)',
      input: 'oklch(0.22 0.01 20 / 13%)',
      // Категориальная палитра графиков для компонентов shadcn.
      'chart-1': 'oklch(0.55 0.21 27)',
      'chart-2': 'oklch(0.76 0.14 72)',
      'chart-3': 'oklch(0.48 0.08 168)',
      'chart-4': 'oklch(0.81 0.08 15)',
      'chart-5': 'oklch(0.52 0.015 20)',
      // Сайдбар в терминах shadcn — их читают компоненты из components/ui.
      // Видимую заливку задаёт секция sidebar ниже.
      sidebar: 'oklch(0.55 0.21 27)',
      'sidebar-foreground': 'oklch(0.99 0 0)',
      'sidebar-primary-foreground': 'oklch(0.99 0 0)',
      'sidebar-accent': 'oklch(1 0 0 / 14%)',
      'sidebar-accent-foreground': 'oklch(0.99 0 0)',
      'sidebar-border': 'oklch(1 0 0 / 16%)',
    },

    misc: {
      // Полосы скелетона.
      'skeleton-from': '#f4efef',
      'skeleton-to': '#e9e1e1',
      // Ползунок скроллбара.
      'scroll-thumb': '#ddd3d3',
      'scroll-thumb-hover': '#b9adae',
      // Подписи осей на графиках.
      'chart-tick': '#8a7d80',
      // Фон приложения — три ступени градиента-бумаги.
      'mesh-1': '#fdfbfb',
      'mesh-2': '#faf8f7',
      'mesh-3': '#f7f3f3',
      // Пятна на фоне: еле заметный фирменный румянец в углах.
      'mesh-glow-1': 'rgba(225, 29, 29, 0.10)',
      'mesh-glow-2': 'rgba(255, 92, 104, 0.07)',
      'mesh-glow-3': 'rgba(214, 160, 140, 0.05)',
      // Нейтральные заливки, доставшиеся от донорского приложения.
      'neutral-fill': '#f0f0f0',
      'neutral-fill-2': '#fafafa',
      'neutral-line': '#cccccc',
    },

  },

  // ---- Тёмная тема --------------------------------------------------------
  // Глубина — тёплый почти-чёрный (графит), а не затемнённый красный.
  dark: {
    neutral: {
      paper: '#171214',
      paperHi: '#1b1517',
      surface: '#201a1c',
      surface2: '#292123',
      surface3: '#33292c',
      line: '#382e30',
      lineSoft: '#382e30',
      lineMid: '#42383a',
      lineStrong: '#4a3e40',
      ink: '#f7f3f3',
      ink2: '#cabfc1',
      ink25: '#b3a7a9',
      ink3: '#a19698',
      ink4: '#7d7174',
      inkMuted: '#9ca3af',
    },
    brand: {
      base: '#f2564f',
      strong: '#e11d1d',
      ink: '#ff8f86',
      soft: 'rgba(225, 29, 29, 0.16)',
      tint: 'rgba(225, 29, 29, 0.08)',
    },
    ok: {
      tint: 'rgba(74, 222, 128, 0.08)',
      soft: 'rgba(74, 222, 128, 0.14)',
      softAlt: 'rgba(74, 222, 128, 0.14)',
      border: 'rgba(74, 222, 128, 0.35)',
      base: '#34d399',
      ink: '#4ade80',
      strong: '#86efac',
    },
    warn: {
      tint: 'rgba(251, 191, 36, 0.08)',
      soft: 'rgba(251, 191, 36, 0.14)',
      softAlt: 'rgba(251, 191, 36, 0.14)',
      border: 'rgba(251, 191, 36, 0.35)',
      base: '#fbbf24',
      ink: '#fbbf24',
      strong: '#fcd34d',
    },
    bad: {
      tint: 'rgba(255, 107, 107, 0.08)',
      soft: 'rgba(255, 107, 107, 0.14)',
      softAlt: 'rgba(255, 107, 107, 0.14)',
      border: 'rgba(255, 107, 107, 0.35)',
      base: '#f87171',
      ink: '#ff6b6b',
      strong: '#fca5a5',
    },
    info: {
      tint: 'rgba(56, 189, 248, 0.08)',
      soft: 'rgba(56, 189, 248, 0.14)',
      softAlt: 'rgba(56, 189, 248, 0.14)',
      border: 'rgba(56, 189, 248, 0.35)',
      base: '#38bdf8',
      ink: '#7dd3fc',
      strong: '#bae6fd',
    },
    shadcn: {
      background: 'oklch(0.16 0.006 25)',
      foreground: 'oklch(0.96 0.004 25)',
      card: 'oklch(0.22 0.008 25)',
      'card-foreground': 'oklch(0.96 0.004 25)',
      popover: 'oklch(0.2 0.008 25 / 97%)',
      'popover-foreground': 'oklch(0.96 0.004 25)',
      'primary-foreground': 'oklch(0.14 0.005 25)',
      secondary: 'oklch(0.27 0.008 25)',
      'secondary-foreground': 'oklch(0.96 0.004 25)',
      muted: 'oklch(0.27 0.008 25)',
      'muted-foreground': 'oklch(0.72 0.008 25)',
      accent: 'oklch(0.31 0.03 27)',
      'accent-foreground': 'oklch(0.96 0.004 25)',
      destructive: 'oklch(0.66 0.19 25)',
      border: 'oklch(1 0 0 / 11%)',
      input: 'oklch(1 0 0 / 16%)',
      'chart-1': 'oklch(0.66 0.2 27)',
      'chart-2': 'oklch(0.81 0.14 72)',
      'chart-3': 'oklch(0.62 0.1 168)',
      'chart-4': 'oklch(0.84 0.08 15)',
      'chart-5': 'oklch(0.68 0.015 20)',
      sidebar: 'oklch(0.45 0.19 27)',
      'sidebar-foreground': 'oklch(0.99 0 0)',
      'sidebar-primary-foreground': 'oklch(0.99 0 0)',
      'sidebar-accent': 'oklch(1 0 0 / 12%)',
      'sidebar-accent-foreground': 'oklch(0.99 0 0)',
      'sidebar-border': 'oklch(1 0 0 / 14%)',
    },
    misc: {
      'skeleton-from': '#292123',
      'skeleton-to': '#33292c',
      'scroll-thumb': '#4a3e40',
      'scroll-thumb-hover': '#6b5c5f',
      'chart-tick': '#a19698',
      'mesh-1': '#1b1517',
      'mesh-2': '#171214',
      'mesh-3': '#140f11',
      'mesh-glow-1': 'rgba(225, 29, 29, 0.16)',
      'mesh-glow-2': 'rgba(255, 92, 104, 0.10)',
      'mesh-glow-3': 'rgba(214, 160, 140, 0.07)',
      'neutral-fill': '#2b2325',
      'neutral-fill-2': '#241e20',
      'neutral-line': '#4a3e40',
    },
  },

  drift: {
    // Красный: рамки и заливки предупреждающих плашек.
    'brand-soft-border': '#f7c0c0',
    'brand-soft-2': '#fbd9d9',
    'brand-mid': '#f7b3b3',
    'brand-mid-2': '#ffb3ba',
    'brand-tint-2': '#fdf5f4',
    'bad-border-soft': '#fecaca',
    'bad-tint-2': '#fff1f2',
    'bad-base-soft': '#fda4af',
    'bad-base-2': '#f87171',
    // Зелёный.
    'ok-soft-2': '#e4f8ed',
    'ok-tint-2': '#eafaf0',
    'ok-tint-3': '#f4faf6',
    'ok-border-2': '#bbf7d0',
    'ok-base-2': '#22c55e',
    'ok-ink-2': '#11844c',
    'ok-mid': '#1b7a4b',
    'ok-strong-2': '#047857',
    'ok-deep': '#14532d',
    // Янтарь.
    'warn-soft-2': '#fef9c3',
    'warn-tint-2': '#fff9e8',
    'warn-tint-3': '#fff8e8',
    'warn-border-2': '#f3dfaa',
    'warn-border-3': '#f4dfad',
    'warn-base-2': '#e7a600',
    'warn-base-3': '#ffab1f',
    'warn-ink-2': '#b7791f',
    'warn-strong-2': '#854d0e',
    'warn-strong-3': '#8a5a00',
    // Рыжий — отдельная ветка янтаря, используется в статусах доставки.
    'orange-tint': '#ffedd5',
    'orange-tint-2': '#fef2e8',
    'orange-soft': '#ffc9b0',
    'orange-base': '#ff7a2f',
    'orange-ink': '#c26d19',
    'orange-ink-2': '#b5732f',
    'orange-strong': '#c2410c',
    'orange-deep': '#a15a49',
    // Нейтральные.
    'neutral-line-2': '#c9bfc1',
    'ink-deep': '#3a3032',
    'ink-hover': '#2b2325',
    // Прочие осевшие оттенки.
    'brand-light': '#ff8f86',
    'brand-coral': '#e2554d',
    'ok-deep-2': '#04815a',
    'ok-base-3': '#10b981',
    'ok-soft-ink': '#6ee7b7',
    'ok-live': '#20b46a',
    'pink-soft': '#fce7f3',
  },

  // ---- Графики ------------------------------------------------------------
  // Правило подбора: серии обязаны отличаться и по тону, и по светлоте —
  // «все оттенки красного» нечитаемы. Тёплое ядро (красный, золото, рыжий)
  // разбавлено одним холодным контрапунктом — глубоким зелёным. Бордовых и
  // винных тонов нет: глубину даём рыжим и графитом, а не затемнением красного.
  charts: {
    primary: '#e11d1d', //   0°  50% — главная серия: выручка, факт, баланс
    secondary: '#f0a52a', // 38°  55% — вторая серия: обращения, ROMI, показы
    positive: '#2f7d64', // 163°  34% — план, прибыль (холодный контрапункт)
    negative: '#b5491f', //  17°  42% — расходы, убыток
    neutral: '#7d7174', // 350°  47% — прочее, вспомогательные линии
    soft: '#ffa8b0', //    355°  83% — светлый акцент, дальние доли
  },

  chartText: {
    primary: '#c01818',
    secondary: '#92400e',
    positive: '#2b6b56',
    negative: '#9a3c18',
    neutral: '#6b6063',
    soft: '#c01818',
  },

  // ---- Сайдбар ------------------------------------------------------------
  // У МОСТОВОГО — сплошная фирменная плашка с белым текстом.
  sidebar: {
    from: '#e11d1d',
    to: '#cc1414',
    foreground: '#ffffff',
    activeBg: '#ffffff',
    activeInk: '#c81414',
    border: 'rgba(255, 255, 255, 0.14)',
    oklch: '0.55 0.21 27',
  },

  // ---- Тёмная консоль журнала --------------------------------------------
  // Цвета перенесены из .bot-terminal* старой админки витрины — яркие и
  // насыщенные, чтобы читались на почти-чёрном фоне.
  terminal: {
    bg: '#101114',
    border: '#24242a',
    text: '#e4e4e8',
    muted: '#9698a4',
    time: '#777986',
    stage: '#a898ff',
    rule: 'rgba(255, 255, 255, .045)',
    info: '#63daa1',
    warn: '#f0b75b',
    error: '#ff6e7b',
    online: '#20b46a',
    statusSuccess: '#34d399',
    statusError: '#f87171',
    statusSkipped: '#a19698',
    statusReceived: '#f2564f',
    statusDryRun: '#fbbf24',
    statusDefault: '#7d7174',
  },

  // Щедрые радиусы: карточка ~25px, крупные блоки ~31px, кнопки и поля ~11px.
  // Всё производится от одного токена.
  radius: '0.875rem',

  onBrand: '#ffffff',
}

/** Пресет по умолчанию, уже разрешённый в объект. */
export const DEFAULT_ACCENT_PRESET: AccentPreset =
  BRAND.accents.find(a => a.id === BRAND.defaultAccent) ?? BRAND.accents[0]

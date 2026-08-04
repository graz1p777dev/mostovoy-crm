// ============================================================================
// Реестр шрифтов.
//
// next/font требует статических вызовов загрузчиков (имя семейства должно быть
// видно сборщику), поэтому подставить шрифт «по строке из конфига» нельзя.
// Решение: здесь лежат готовые статические вызовы, а бренд-конфиг выбирает их
// по ключу. Новый шрифт для клиента = одна запись в этом реестре плюс правка
// BRAND.fonts.
//
// Имя CSS-переменной задаётся в момент вызова загрузчика и изменить его потом
// нельзя, поэтому реестры разведены: семейства для основного текста объявлены
// с --font-sans, для заголовков — с --font-display. Семейство, годное в обе
// роли, объявляется дважды; файлы шрифта при этом не дублируются.
//
// Все шрифты берутся из next/font/google — новых зависимостей не требуется.
// ============================================================================

import { Inter, IBM_Plex_Sans_Condensed, Manrope, Unbounded } from 'next/font/google'

/** Шрифты, доступные для основного текста (--font-sans). */
export type SansFontKey = 'inter' | 'manrope'

/** Шрифты, доступные для заголовков (--font-display). */
export type DisplayFontKey = 'plex-condensed' | 'unbounded' | 'inter' | 'manrope'

// Кириллица нужна везде: интерфейс русскоязычный.
const interSans = Inter({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-sans',
})

const manropeSans = Manrope({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-sans',
})

// Узкий технический гротеск: «приборная» интонация и экономия ширины
// в плотных таблицах. Кириллица у Plex Condensed есть.
const plexDisplay = IBM_Plex_Sans_Condensed({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
})

// Геометрический гротеск с широкими формами: хорош в заголовках, но в плотных
// таблицах жирное начертание «забивает» данные.
const unboundedDisplay = Unbounded({
  subsets: ['latin', 'cyrillic'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
})

const interDisplay = Inter({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-display',
})

const manropeDisplay = Manrope({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-display',
})

const SANS: Record<SansFontKey, { variable: string; className: string }> = {
  inter: interSans,
  manrope: manropeSans,
}

const DISPLAY: Record<DisplayFontKey, { variable: string }> = {
  'plex-condensed': plexDisplay,
  unbounded: unboundedDisplay,
  inter: interDisplay,
  manrope: manropeDisplay,
}

/** Классы шрифтов для <html> и <body> по выбору из бренд-конфига. */
export function getBrandFonts(sans: SansFontKey, display: DisplayFontKey) {
  return {
    /** Классы с определениями CSS-переменных — вешаются на <html>. */
    variables: `${SANS[sans].variable} ${DISPLAY[display].variable}`,
    /** Класс основного шрифта — вешается на <body>. */
    bodyClassName: SANS[sans].className,
  }
}

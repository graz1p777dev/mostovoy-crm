# МОСТОВОЙ OS — UI Design System v1.0

> Единственный источник истины для всего интерфейса системы.
> Основа: `01_Vision_Architecture.md` · `04_Design_System.md` · Dashboard утверждён.
> Статус: Проектирование завершено. Готов к реализации.
> Код не затронут.

---

## Принцип системы

Каждый элемент интерфейса существует не как украшение, а как инструмент.

Дизайн должен ощущаться так же, как продукты:
**Linear · Stripe · Vercel · Raycast · Notion · Arc**

Три слова, которые описывают весь дизайн:
**Пространство. Точность. Доверие.**

---

## 1. Цветовая система

### 1.1 Фирменная палитра (источник — брендбук МОСТОВОЙ 2025)

| Токен | HEX | RGB | PANTONE | Применение |
|-------|-----|-----|---------|------------|
| `--brand-dark` | `#0c2136` | 12, 33, 54 | 289 C | Sidebar фон, тёмные заголовки |
| `--brand` | `#0c4d6c` | 12, 77, 108 | 3025 C | Primary кнопки, активные элементы |
| `--brand-mid` | `#1a6a8f` | 26, 106, 143 | — | Hover-состояния, градиенты |
| `--brand-light` | `#2d8fb5` | 45, 143, 181 | — | Акценты, иконки |
| `--steel` | `#a2b4c0` | 162, 180, 192 | 536 C | Placeholder, иконки неактивные |
| `--steel-dark` | `#7a9aab` | 122, 154, 171 | — | Вторичный текст |
| `--steel-light` | `#c8d6de` | 200, 214, 222 | — | Borders, dividers |
| `--fog` | `#ebebee` | 230, 235, 238 | 656 C | Фон старый (заменён на систему ниже) |

### 1.2 Нейтральная шкала (основа интерфейса)

Нейтральные цвета используются в 80% интерфейса. Брендовые — точечно.

```
--neutral-50:   #f8f9fb   → фон страницы
--neutral-100:  #f3f4f6   → фон hover, disabled
--neutral-200:  #e5e7eb   → borders, dividers
--neutral-300:  #d1d5db   → placeholder borders
--neutral-400:  #9ca3af   → placeholder text, иконки неактивные
--neutral-500:  #6b7280   → вторичный текст
--neutral-600:  #4b5563   → основной текст тёмный
--neutral-700:  #374151   → текст таблиц
--neutral-800:  #1f2937   → заголовки карточек
--neutral-900:  #111827   → основные заголовки
```

### 1.3 Семантические цвета

Используются строго по смыслу. Нельзя применять "для красоты".

```
Success:
  --success-bg:    #f0fdf4
  --success-border:#bbf7d0
  --success-text:  #16a34a
  --success-bold:  #15803d

Warning:
  --warning-bg:    #fffbeb
  --warning-border:#fde68a
  --warning-text:  #d97706
  --warning-bold:  #b45309

Danger:
  --danger-bg:     #fef2f2
  --danger-border: #fecaca
  --danger-text:   #dc2626
  --danger-bold:   #b91c1c

Info:
  --info-bg:       #f0f7fc
  --info-border:   #bae0f5
  --info-text:     #0c4d6c
  --info-bold:     #0c2136
```

### 1.4 Правила применения цвета

- Фон страницы: `#f5f6f8` (не белый, не серый — чуть теплее)
- Фон карточек: `#ffffff`
- Фон Sidebar: `#0c1f33` (темнее бренда — создаёт глубину)
- Акцентный цвет (`#0c4d6c`) — не более 10% экрана
- Красный — только для ошибок и критических статусов
- Зелёный — только для успеха и подтверждений
- Никогда не смешивать более 2 семантических цветов в одном блоке

---

## 2. Типографика

### 2.1 Шрифт

**Основной:** `Inter` (variable font)
**CDN:** `https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap`

**Настройки рендеринга:**
```css
-webkit-font-smoothing: antialiased;
-moz-osx-font-smoothing: grayscale;
font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11';
```

`cv02`, `cv03`, `cv04`, `cv11` — делают цифры в Inter более читаемыми (открытые "g", "a", прямые "l").

### 2.2 Шкала размеров

| Токен | Размер | Высота | Вес | Letter-spacing | Применение |
|-------|--------|--------|-----|----------------|------------|
| `--text-2xs` | 9px | 1.4 | 500–600 | +0.06em | Labels uppercase, nav section headers |
| `--text-xs` | 10px | 1.4 | 400–600 | +0.02em | Badges, timestamps, подписи |
| `--text-sm` | 11px | 1.5 | 400–600 | 0 | Вторичный текст, metadata |
| `--text-base` | 12px | 1.5 | 400–600 | 0 | Основной текст интерфейса |
| `--text-md` | 13px | 1.5 | 500–700 | -0.1px | Текст кнопок, nav items |
| `--text-lg` | 14px | 1.4 | 600–700 | -0.2px | Заголовки карточек |
| `--text-xl` | 16px | 1.3 | 700 | -0.3px | Заголовки секций |
| `--text-2xl` | 20px | 1.2 | 700–800 | -0.5px | Заголовки страниц |
| `--text-3xl` | 26px | 1.1 | 800 | -1px | KPI значения (средние) |
| `--text-4xl` | 32px | 1.0 | 800 | -1.5px | KPI значения (крупные) |
| `--text-5xl` | 40px | 1.0 | 800 | -2px | Hero-метрики |

### 2.3 Числа и данные

Все числа в таблицах и метриках — tabular numerals:
```css
font-variant-numeric: tabular-nums;
```

Это выравнивает числа по столбцам. Обязательно для всех таблиц.

### 2.4 Иерархия текста

```
Заголовок страницы:   14px · 700 · #0c2136 · letter-spacing: -0.3px
Заголовок карточки:   11px · 600 · #0c2136 · UPPERCASE · letter-spacing: +0.07em
Подзаголовок:         10px · 500 · #9ca3af
Основной текст:       12px · 400–500 · #374151
Вторичный текст:      11px · 400 · #9ca3af
Метка (label):        10px · 600 · #9ca3af · UPPERCASE · letter-spacing: +0.06em
Timestamp:            10px · 500 · #b0b8c4
```

---

## 3. Система отступов

### 3.1 Базовая единица

Все отступы кратны **4px**.

```
--space-0:   0px
--space-1:   4px
--space-2:   8px
--space-3:   12px
--space-4:   16px
--space-5:   20px
--space-6:   24px
--space-8:   32px
--space-10:  40px
--space-12:  48px
--space-16:  64px
--space-20:  80px
```

### 3.2 Применение по контексту

| Контекст | Токен | Значение |
|----------|-------|----------|
| Padding внутри badge | `--space-1` · `--space-2` | 4px 8px |
| Gap между иконкой и текстом | `--space-2` | 8px |
| Padding nav item | `--space-2` · `--space-3` | 8px 12px |
| Padding карточки | `--space-4` · `--space-5` | 16px–20px |
| Gap между карточками | `--space-3` | 12px |
| Padding страницы | `--space-4` · `--space-6` | 16px–24px |
| Gap между секциями | `--space-4` | 16px |
| Padding модального окна | `--space-6` | 24px |

### 3.3 Правило воздуха (Air Rule)

Карточки должны дышать. Минимальный padding карточки — **16px** по горизонтали, **14px** по вертикали.

Заголовок секции и первый элемент секции — gap не менее **12px**.

---

## 4. Grid

### 4.1 Layout

```
Sidebar:       192px · fixed · height: 100vh
Content:       flex: 1 · min-width: 0
Topbar:        height: 52px · position: sticky top: 0
Content area:  flex: 1 · overflow-y: auto
```

### 4.2 Внутренняя сетка контента

```
Одна колонка:         full-width (таблицы, широкие панели)
Две колонки:          1fr 1fr (KPI-карточки малые)
Три колонки:          1fr 1fr 1fr (статистика)
Четыре колонки:       repeat(4, 1fr) (KPI dashboard-строка)
Кастомные пропорции:  3fr 2fr, 2fr 1fr (Split Focus)
```

### 4.3 Breakpoints

| Ширина | Поведение |
|--------|-----------|
| ≥ 1280px | Full layout: sidebar + split panels |
| 1024–1279px | Sidebar сужается до 160px, контент сжимается |
| 768–1023px | Sidebar скрывается, кнопка-гамбургер |
| < 768px | Мобильная навигация снизу, one-column layout |

**Приоритет разработки:** Desktop-first. Мобильная версия — следующий этап.

---

## 5. Карточки

### 5.1 Базовая карточка

```
background:    #ffffff
border-radius: 14px
box-shadow:    0 1px 3px rgba(0,0,0,.04), 0 0 0 1px rgba(0,0,0,.03)
padding:       16px 18px (стандарт)

Никаких border отдельно — только box-shadow с 1px ring.
Это убирает резкие линии и создаёт глубину.
```

### 5.2 Варианты карточек

**KPI Card (крупная)**
```
padding:       18px 20px
border-radius: 16px
Заголовок:     10px · 600 · UPPERCASE · #9ca3af · letter-spacing: +0.05em
Значение:      26–32px · 800 · #0c2136 · letter-spacing: -1px
Подпись:       10px · 400 · #b0b8c4
Progress:      2px bar внизу или сбоку
Trend badge:   справа вверху
```

**Metric Row (в левой панели)**
```
Без карточки-обёртки. Секция с разделителями.
Заголовок секции: 9px · 600 · #d1d5db · UPPERCASE · letter-spacing: +0.1em
Значение: 28–32px · 800 · #0c2136
Подпись: 11px · 400 · #9ca3af
```

**List Card (таблица/лента)**
```
padding:       0 (header 14px 18px, rows 0 18px)
border-radius: 14px
Строки разделяются: 1px solid rgba(0,0,0,.04) (не #e5e7eb — слишком резко)
```

**Accent Card (highlight)**
```
background:    linear-gradient(135deg, #0c4d6c, #0c2136)
Текст:         #ffffff (основной), rgba(162,180,192,.7) (вторичный)
Применение:    баннер состояния, приветствие, критическая метрика
```

### 5.3 Иерархия теней

```
Level 0 (flat):   box-shadow: 0 0 0 1px rgba(0,0,0,.05)         → таблицы, строки
Level 1 (card):   0 1px 3px rgba(0,0,0,.04), 0 0 0 1px rgba(0,0,0,.03)  → стандартные карточки
Level 2 (raised): 0 4px 12px rgba(0,0,0,.08), 0 0 0 1px rgba(0,0,0,.04) → dropdown, popover
Level 3 (modal):  0 20px 60px rgba(12,33,54,.16), 0 0 0 1px rgba(0,0,0,.06) → модальные окна
Level 4 (overlay):0 40px 100px rgba(12,33,54,.24)               → drawer
```

---

## 6. Таблицы

### 6.1 Принципы таблиц

- Никаких вертикальных линий
- Горизонтальные разделители — очень тонкие: `1px solid rgba(0,0,0,.04)`
- Заголовок таблицы — отдельный стиль
- Hover строки — очень мягкий: `background: rgba(0,0,0,.02)`
- Числа всегда right-aligned в числовых столбцах
- tabular-nums обязательно

### 6.2 Анатомия таблицы

```
Table Header Row:
  background:       #fafafa (едва заметно отличается от white)
  border-bottom:    1px solid rgba(0,0,0,.06)
  cell padding:     8px 16px
  font:             9px · 600 · #9ca3af · UPPERCASE · letter-spacing: +0.07em

Table Body Row:
  height:           44px (min-height)
  cell padding:     10px 16px
  border-bottom:    1px solid rgba(0,0,0,.04)
  font:             12px · 400–500 · #374151

Table Footer (итоги):
  background:       #fafafa
  border-top:       1px solid rgba(0,0,0,.08)
  font:             12px · 700 · #0c2136

Hover state:
  background:       rgba(12,77,108,.03)
  transition:       background 100ms ease

Active/selected row:
  background:       rgba(12,77,108,.06)
  border-left:      2px solid #0c4d6c
```

### 6.3 Типы ячеек

```
Текстовая:    left-align · #374151
Числовая:     right-align · tabular-nums · #1f2937
Дата:         left-align · #9ca3af · 11px
Статус:       badge по центру или слева
Имя/аватар:   flex с аватаром 24px · left-align
Действия:     right-align · иконки 16px · opacity 0 → 1 on hover
Пустая:       "—" · #d1d5db · center-align
```

### 6.4 Размеры колонок

- Фиксированные колонки (дата, статус): width задаётся явно
- Гибкие колонки (имя, комментарий): flex-grow
- Числовые: min-width по самому длинному значению

---

## 7. Формы

### 7.1 Input

```
height:         40px
border-radius:  10px
border:         1px solid #e5e7eb
background:     #ffffff
padding:        0 12px
font:           13px · 400 · #1f2937
placeholder:    #b0b8c4

Focus:
  border-color: #0c4d6c
  box-shadow:   0 0 0 3px rgba(12,77,108,.1)
  outline:      none

Error:
  border-color: #dc2626
  box-shadow:   0 0 0 3px rgba(220,38,38,.1)

Disabled:
  background:   #f9fafb
  color:        #9ca3af
  cursor:       not-allowed

Read-only:
  background:   #f9fafb
  border-color: transparent
  color:        #6b7280
```

**Размеры Input:**
```
sm: height 32px · font 11px · padding 0 10px · border-radius 8px
md: height 40px · font 13px · padding 0 12px · border-radius 10px (default)
lg: height 48px · font 14px · padding 0 16px · border-radius 12px
```

### 7.2 Label

```
font:           10px · 600 · #6b7280 · UPPERCASE · letter-spacing: +0.05em
margin-bottom:  6px
gap с input:    6px

Required marker: · color: #dc2626 · font-size: 12px
```

### 7.3 Textarea

```
border-radius:  10px
border:         1px solid #e5e7eb
padding:        10px 12px
font:           13px · 400 · #1f2937
resize:         vertical
min-height:     80px
line-height:    1.5
```

### 7.4 Select / Dropdown

```
Trigger: идентичен Input по размерам
Иконка:  ChevronDown 14px · #9ca3af · right: 10px
Content:
  background:    #ffffff
  border-radius: 12px
  box-shadow:    Level 2
  padding:       4px
  z-index:       99999

SelectItem:
  padding:       8px 12px
  border-radius: 8px
  font:          13px · 400 · #374151
  cursor:        pointer

  Hover: background #f5f6f8
  Active/selected: background rgba(12,77,108,.08) · color #0c4d6c · font-weight 600
```

### 7.5 Checkbox / Toggle

**Checkbox:**
```
size:           16px × 16px
border-radius:  4px
border:         1.5px solid #d1d5db
background:     #ffffff

Checked:
  background:   #0c4d6c
  border-color: #0c4d6c
  checkmark:    белый SVG

Focus: box-shadow 0 0 0 3px rgba(12,77,108,.15)
```

**Toggle:**
```
track size:     36px × 20px · border-radius: 10px
thumb:          16px × 16px · border-radius: 8px

Off: track #e5e7eb · thumb #ffffff
On:  track #0c4d6c · thumb #ffffff

Transition: all 150ms ease
```

### 7.6 Error message

```
font:    11px · 400 · #dc2626
margin-top: 5px
display: flex · align-items: center · gap: 4px
icon:    AlertCircle 11px
```

### 7.7 Layout форм

- Стандартный grid для полей: `grid-template-columns: 1fr 1fr · gap: 14px`
- Full-width поля: название клиента, комментарий, причина отказа
- Секции формы разделяются: метка секции 9px + 14px gap
- Обязательные поля помечаются `*` рядом с label
- Footer формы (кнопки): `flex · justify-content: space-between · padding-top: 16px · border-top: 1px solid rgba(0,0,0,.05)`

---

## 8. Кнопки

### 8.1 Варианты

**Primary**
```
background:    #0c4d6c
color:         #ffffff
font:          13px · 600
height:        40px · padding: 0 18px
border-radius: 10px
border:        none

Hover:  background #1a6a8f
Active: background #0c2136 · transform: scale(0.99)
Focus:  box-shadow: 0 0 0 3px rgba(12,77,108,.25)
```

**Secondary / Ghost**
```
background:    transparent
color:         #374151
border:        1px solid #e5e7eb
font:          13px · 500
height:        40px · padding: 0 16px
border-radius: 10px

Hover:  background #f5f6f8 · border-color: #d1d5db
```

**Destructive**
```
background:    #dc2626
color:         #ffffff
Hover:         background #b91c1c
```

**Ghost (без border)**
```
background:    transparent
color:         #6b7280
Hover:         background rgba(0,0,0,.04) · color #374151
```

**Link**
```
background:    transparent
color:         #0c4d6c
font:          13px · 500
text-decoration: underline (dashed)
padding:       0
border:        none
Hover: color #0c2136
```

### 8.2 Размеры кнопок

```
xs:  height 28px · padding 0 10px · font 11px · radius 7px
sm:  height 32px · padding 0 12px · font 12px · radius 8px
md:  height 40px · padding 0 18px · font 13px · radius 10px (default)
lg:  height 48px · padding 0 22px · font 14px · radius 12px
```

### 8.3 Состояния кнопок

```
Loading:  spinner 14px · opacity кнопки 0.8 · cursor: wait · disabled
Disabled: opacity 0.4 · cursor: not-allowed · pointer-events: none
Icon-only: width = height · padding 0 (квадрат)
Icon+text: gap 7px между иконкой и текстом
```

### 8.4 Группы кнопок

Footer модального окна:
```
layout:   flex · justify-content: flex-end · gap: 8px
order:    [Деструктивная слева] ··· [Отмена] [Сохранить]
```

---

## 9. Badges

### 9.1 Варианты

```
Успех:       bg #f0fdf4 · text #16a34a · border rgba(22,163,74,.15)
Предупрежд.: bg #fffbeb · text #d97706 · border rgba(217,119,6,.15)
Ошибка:      bg #fef2f2 · text #dc2626 · border rgba(220,38,38,.15)
Инфо:        bg #f0f7fc · text #0c4d6c · border rgba(12,77,108,.15)
Нейтральный: bg #f3f4f6 · text #6b7280 · border rgba(0,0,0,.06)
```

### 9.2 Анатомия Badge

```
font:          9–10px · 600
padding:       2px 7px (стандарт) · 2px 10px (крупный)
border-radius: 6px (стандарт) · 20px (pill)
border:        1px solid (прозрачная версия цвета)
display:       inline-flex · align-items: center · gap: 4px
```

### 9.3 Status Badge (для сотрудников и записей)

```
Работает/Пришла:    🟢 + "На месте"   · success
Не вышла/Больничный: 🔴 + текст       · danger
Отгул:              🟡 + "Отгул"      · warning
Запись:             ● + текст         · info
```

### 9.4 KPI Badge (прогресс выполнения)

```
≥ 80%:  success
50–79%: warning
< 50%:  danger
Нет данных: neutral
```

---

## 10. Progress

### 10.1 Progress Bar (линейный)

```
Высота:       2px (тонкий, элегантный) · 4px (стандарт) · 6px (крупный)
border-radius: половина высоты
Track color:  #f3f4f6

Fill colors:
  success: #16a34a
  warning: #f59e0b
  danger:  #ef4444
  brand:   #0c4d6c
  gradient: linear-gradient(90deg, #0c4d6c, #1a6a8f)
```

**Анимация появления:**
```css
@keyframes progress-in {
  from { width: 0; }
  to   { width: <target>%; }
}
animation: progress-in 600ms ease-out forwards;
```

### 10.2 Circular Progress (для KPI в будущем)

```
size:         32px · stroke-width: 3px
background:   #f3f4f6
foreground:   по семантике
```

### 10.3 Индикатор выполнения плана

```
Формат:    "12 / 33 · 36%"
Компоновка: label + fraction + bar + badge в одну строку
```

---

## 11. Charts

### 11.1 Библиотека

**Recharts** (React-совместимость, лёгкий, кастомизируемый)

Все графики кастомизированы: стандартный Recharts стиль не используется.

### 11.2 Цвета графиков

```
Primary series:   #0c4d6c
Secondary series: #a2b4c0
Success series:   #16a34a
Neutral series:   #e5e7eb (план/фон)
Grid lines:       rgba(0,0,0,.05)
Axis labels:      9px · #b0b8c4
Tooltip bg:       #0c2136 · text #ffffff · radius 8px
```

### 11.3 Bar Chart (Выручка по неделям)

```
Bar width:     60% от ширины group
Border-radius: 3px 3px 0 0 (только верх)
Gap:           8px между группами
Bar Plan:      #e5eef2 (светлый фоновый)
Bar Fact:      #0c4d6c
Hover:         opacity 0.85 · tooltip появляется
```

### 11.4 Sparkline (мини-тренд)

```
Применение:    в KPI-карточках справа сверху или снизу
size:          60px × 28px
stroke:        1.5px · #0c4d6c
fill:          rgba(12,77,108,.08) (area под линией)
no axes, no labels
```

### 11.5 Правила графиков

- Всегда есть заголовок и легенда
- Нет лишних декораций (3D, тени, завышенные labels)
- Tooltip — тёмный (`#0c2136`) с белым текстом
- Нет анимации при каждом ре-рендере, только при первом появлении
- Пустое состояние — заглушка с текстом, без пустых осей

---

## 12. Sidebar

### 12.1 Анатомия

```
width:        192px · fixed
background:   #0c1f33
height:       100vh
display:      flex · flex-direction: column
overflow-x:   hidden
overflow-y:   auto (кастомный скроллбар 2px)
```

**Структура сверху вниз:**
```
[Logo block]        22px padding · logo 30px + текст
[Nav sections]      с section-label
[Dividers]          1px rgba(255,255,255,.05)
[Footer]            margin-top: auto · user block
```

### 12.2 Logo block

```
padding:       22px 18px 18px
display:       flex · align-items: center · gap: 10px
Logo mark:     30px × 30px · border-radius 8px · gradient brand
App name:      12px · 700 · rgba(255,255,255,.9)
App subtitle:  9px · rgba(162,180,192,.5)
```

### 12.3 Nav section

```
Section label: 9px · 600 · rgba(162,180,192,.4) · UPPERCASE · letter-spacing +0.08em
padding:       8px 10px 4px

Nav item:
  padding:       7px 8px
  border-radius: 8px
  gap:           9px (icon + text)
  transition:    all 100ms ease

  Default:  opacity .7 · color rgba(162,180,192,.65) · icon opacity .5
  Hover:    background rgba(255,255,255,.04)
  Active:   background rgba(12,77,108,.5) · text rgba(255,255,255,.92) · icon opacity 1
```

### 12.4 Nav divider

```
height:     1px
background: rgba(255,255,255,.05)
margin:     6px 10px
```

### 12.5 Sidebar footer

```
margin-top:   auto
padding:      14px 10px
border-top:   1px solid rgba(255,255,255,.05)

User row:
  Avatar:  28px · gradient brand · border-radius 8px · initials 10px 700
  Name:    11px · 600 · rgba(255,255,255,.85)
  Role:    9px · rgba(162,180,192,.5)
  Status:  6px dot · green #22c55e · margin-left auto
```

---

## 13. Topbar

### 13.1 Анатомия

```
height:      52px
background:  rgba(245,246,248,.85)
backdrop-filter: blur(12px)
border-bottom: 1px solid rgba(0,0,0,.05)
position:    sticky · top: 0 · z-index: 100
padding:     0 24px
display:     flex · align-items: center · justify-content: space-between
```

### 13.2 Левая часть

```
Title:    14px · 700 · #0c2136 · letter-spacing: -0.3px
Separator: "/" · color #d1d5db · margin: 0 6px
Date:     12px · 400 · #9ca3af
Breadcrumb (если есть): теряет насыщенность к последнему уровню
```

### 13.3 Правая часть

```
Period tabs:
  background: rgba(0,0,0,.05) · border-radius: 8px · padding: 2px
  Tab: 11px · 600 · border-radius: 6px · padding: 4px 10px
  Active: background #ffffff · shadow: 0 1px 3px rgba(0,0,0,.08)
  Default: color #9ca3af

User avatar:
  28px × 28px · border-radius 8px · gradient brand
  cursor pointer
  Hover: opacity .85
```

---

## 14. Модальные окна

### 14.1 Overlay

```
background:   rgba(0,0,0,.65)
backdrop-filter: blur(8px)
position:     fixed · inset: 0 · z-index: 9999
display:      flex · align-items: center · justify-content: center
animation:    fadeIn 150ms ease-out
```

### 14.2 Анатомия Modal

```
background:    #ffffff
border-radius: 20px
box-shadow:    Level 3
width:         480px (default) · 640px (wide) · 360px (compact)
max-height:    90vh
overflow:      hidden (body прокручивается)
animation:     slideUp 200ms cubic-bezier(0.34, 1.56, 0.64, 1)
```

**@keyframes slideUp:**
```css
@keyframes slideUp {
  from { opacity: 0; transform: translateY(16px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
```

### 14.3 Структура Modal

```
[Header]    gradient brand · padding: 20px 24px · border-radius 20px 20px 0 0
  - Avatar/icon (40px)
  - Title (15px · 700 · #ffffff)
  - Subtitle (12px · rgba(255,255,255,.7))
  - Close button: top-right · X icon · rgba(255,255,255,.6) → white hover

[Body]      background #ffffff · padding: 20px 24px · overflow-y: auto
  - Секции с разделителями
  - Поля форм

[Footer]    background #ffffff · padding: 14px 24px 20px
  border-top: 1px solid rgba(0,0,0,.05)
  layout:  flex · justify-content: space-between
```

### 14.4 Правила Modal

- Escape всегда закрывает
- Клик на overlay закрывает
- Scroll lock на body при открытии
- createPortal → document.body (не вложен в layout)
- Не более 2 модалов одновременно
- Деструктивные действия — отдельный Confirm modal (compact, 360px)

---

## 15. Drawer

### 15.1 Анатомия

```
position:   fixed · right: 0 · top: 0 · bottom: 0
width:      400px (default) · 560px (wide)
background: #ffffff
box-shadow: -20px 0 60px rgba(12,33,54,.12)
z-index:    9998
animation:  slideInRight 250ms cubic-bezier(0.25, 0.46, 0.45, 0.94)
```

**Overlay:**
```
background: rgba(0,0,0,.4)
backdrop-filter: blur(4px)
```

### 15.2 Применение

- Детальная информация об объекте (клиент, сотрудник) без перехода
- Расширенные фильтры таблиц
- История действий
- Не для форм создания (это Modal)

### 15.3 Структура

```
[Topbar]   padding: 18px 20px · border-bottom: 1px solid rgba(0,0,0,.05)
           Title + Close кнопка
[Body]     flex: 1 · overflow-y: auto · padding: 20px
[Footer]   опционально · padding: 14px 20px · border-top
```

---

## 16. Dropdown / Popover

### 16.1 Анатомия

```
background:    #ffffff
border-radius: 12px
box-shadow:    Level 2
padding:       4px
z-index:       99999
animation:     fadeIn + slideDown 150ms ease-out
min-width:     180px
```

### 16.2 Dropdown item

```
padding:       8px 12px
border-radius: 8px
font:          13px · 400 · #374151
display:       flex · align-items: center · gap: 9px
icon:          15px · #9ca3af

Hover:         background #f5f6f8
Active/checked: background rgba(12,77,108,.08) · color #0c4d6c · icon color brand
Destructive:   color #dc2626 · icon red · hover bg #fef2f2
Disabled:      opacity .4 · cursor not-allowed
Separator:     height 1px · background rgba(0,0,0,.05) · margin: 3px 0
```

### 16.3 Применение Popover

```
Trigger:    любой элемент с ref
Placement:  bottom-start (default) · подстраивается если не влезает
Offset:     6px от trigger
Close on:   Escape · click outside · select item
```

---

## 17. Empty States

### 17.1 Принцип

Empty State — это не ошибка, а приглашение к действию.

### 17.2 Анатомия

```
layout:      flex · flex-direction: column · align-items: center · gap: 12px
padding:     48px 24px
text-align:  center

Icon:        40px · color #d1d5db (icon-only) или SVG illustration
Title:       14px · 600 · #374151
Description: 13px · 400 · #9ca3af · max-width: 280px
Action:      Primary button (если возможно действие)
```

### 17.3 Варианты

| Ситуация | Icon | Title | Описание |
|----------|------|-------|---------|
| Нет записей | 📋 Calendar | Записей пока нет | Добавьте первую запись клиента |
| Нет сотрудников | 👥 Users | Команда пуста | Добавьте сотрудников в систему |
| Нет данных за период | 📊 BarChart | Данных нет | Выберите другой период |
| Нет результатов поиска | 🔍 Search | Ничего не найдено | Попробуйте другой запрос |
| Нет доступа | 🔒 Lock | Нет доступа | Обратитесь к владельцу |

---

## 18. Loading States

### 18.1 Spinner

```
size:         16px (inline) · 24px (card) · 32px (page)
color:        #0c4d6c
stroke-width: 2px
animation:    spin 700ms linear infinite
Не используется внутри кнопок дольше 2 секунд.
```

### 18.2 Page Loading

```
Полностраничный лоадер: только на первой загрузке.
Logo + spinner. Background: #f5f6f8.
После загрузки — fade-out 200ms.
```

### 18.3 Inline Loading (в таблицах)

```
Skeleton rows вместо спиннера.
Количество skeleton rows = ожидаемое количество данных (или 5 default).
```

---

## 19. Error States

### 19.1 Inline Error (поле формы)

```
Красная граница input + иконка AlertCircle + текст под полем.
```

### 19.2 Card Error

```
background:   #fef2f2
border:       1px solid rgba(220,38,38,.2)
Icon:         AlertTriangle · 20px · #dc2626
Title:        13px · 600 · #dc2626
Description:  12px · #9ca3af
Action:       "Попробовать снова" (link-style)
```

### 19.3 Toast Error

```
Красный toast с кратким текстом. Не модальное окно.
Максимум 2 строки. Auto-dismiss 5 секунд.
```

### 19.4 Full-page Error (500, 404)

```
Centered layout.
Код ошибки: 48px · 800 · #e5e7eb
Title: 20px · 700 · #374151
Description: 14px · #9ca3af
Action: "На главную" (Primary button)
```

---

## 20. Skeleton

### 20.1 Принцип

Skeleton заменяет реальный контент во время загрузки.
Сохраняет форму и структуру страницы.

### 20.2 Анатомия

```
background:   linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%)
background-size: 200% 100%
animation:    shimmer 1.5s ease-in-out infinite
border-radius: совпадает с реальным элементом

@keyframes shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

### 20.3 Варианты Skeleton

```
Text line:    height 12px · border-radius 6px · ширина переменная (60–90%)
Title:        height 16px · border-radius 6px · ширина 40–70%
Avatar:       круг или border-radius совпадает с аватаром
Card:         полная карточка с fake layout
Table row:    несколько text skeleton в flex-row
KPI card:     title 12px · value 28px · sub 10px · bar 4px
```

### 20.4 Правила Skeleton

- Не показывать skeleton дольше 3 секунд (если дольше — error state)
- Не анимировать появление данных после skeleton (просто replace)
- Количество skeleton-элементов = реальное количество или 5

---

## 21. Toast

### 21.1 Библиотека

**Sonner** (уже используется в проекте)

### 21.2 Позиция

```
position:  fixed · bottom-right (desktop)
           bottom-center (mobile)
z-index:   99998
```

### 21.3 Анатомия Toast

```
background:   #ffffff (light)
border-radius: 12px
box-shadow:    Level 2
padding:       12px 16px
min-width:     280px · max-width: 380px
display:       flex · align-items: center · gap: 10px
font:          13px · #374151

Icon:          16px (по семантике)
Title:         13px · 600
Description:   12px · #6b7280 (опционально)
Action:        link-style button (опционально)
Close:         X button · 14px · #9ca3af
```

### 21.4 Варианты

```
Success:    icon CheckCircle · #16a34a · accent-bar left: 3px green
Error:      icon XCircle · #dc2626 · accent-bar left: 3px red
Warning:    icon AlertTriangle · #d97706 · accent-bar left: 3px amber
Info:       icon Info · #0c4d6c · accent-bar left: 3px brand

Loading:    spinner вместо icon · no auto-dismiss
```

### 21.5 Auto-dismiss

```
Success: 3 секунды
Error:   5 секунд (важнее)
Warning: 5 секунд
Info:    4 секунды
Loading: нет (закрывается вручную или при завершении операции)
```

---

## 22. Уведомления

### 22.1 Типы уведомлений

**In-app Toast** — мгновенная обратная связь на действие (секция 21).

**Notification Bell** — накопленные события требующие внимания.

**Inline Notification** — статичный блок внутри страницы.

### 22.2 Notification Bell

```
Иконка Bell в Topbar · 20px
Badge: абсолютный · top-right · bg #dc2626 · text #fff · 5px 5px · 9px 700
При клике: Dropdown с историей (max 5 последних)

Notification item:
  padding:     10px 14px
  icon:        16px по типу события
  title:       12px · 600 · #1f2937
  time:        10px · #b0b8c4
  Unread:      left-border 2px · #0c4d6c · bg rgba(12,77,108,.03)
  Read:        без highlight
```

### 22.3 Inline Notification (Banner)

```
display:      flex · align-items: flex-start · gap: 12px
padding:      12px 16px
border-radius: 10px
border-left:  3px solid (по семантике)

Success: bg #f0fdf4 · border #16a34a
Warning: bg #fffbeb · border #d97706
Danger:  bg #fef2f2 · border #dc2626
Info:    bg #f0f7fc · border #0c4d6c

Title:   13px · 600
Body:    12px · 400 · (цвет чуть темнее bg)
Close:   X · top-right · опционально
```

---

## 23. Тёмная тема (на будущее)

### 23.1 Принцип

Тёмная тема не просто инвертирует цвета.
Она создаёт другую иерархию глубины: карточки становятся светлее фона, а не темнее.

### 23.2 Dark Mode шкала

```
--dark-base:    #0c1118    → фон страницы (самый тёмный)
--dark-surface: #141c24    → фон карточек
--dark-elevated:#1a2433    → raised карточки, dropdown
--dark-overlay: #1f2d3d    → tooltip, hover
--dark-border:  rgba(255,255,255,.07)
--dark-divider: rgba(255,255,255,.05)
```

### 23.3 Текст в тёмной теме

```
Primary:    rgba(255,255,255,.92)
Secondary:  rgba(255,255,255,.55)
Tertiary:   rgba(255,255,255,.35)
Disabled:   rgba(255,255,255,.2)
```

### 23.4 Sidebar в тёмной теме

```
background: #080e15 (ещё темнее основного фона)
active item: rgba(12,77,108,.6)
```

### 23.5 Семантические цвета в dark mode

Семантические цвета остаются теми же HEX, но фоны приглушаются:
```
success-bg: rgba(22,163,74,.15) — не #f0fdf4
danger-bg:  rgba(220,38,38,.15)
warning-bg: rgba(217,119,6,.15)
```

### 23.6 Реализация

```
CSS custom properties на :root и [data-theme="dark"]
Переключатель: localStorage + system prefers-color-scheme
Transition: color 150ms ease, background 150ms ease — только для theme switch
```

---

## Чеклист соответствия Design System

Перед каждым PR с UI-изменениями проверить:

- [ ] Все цвета из токенов (`--brand`, `--neutral-*`, semantic)
- [ ] Никаких инлайн hex-значений кроме токенов
- [ ] Шрифт Inter, font-smoothing включён
- [ ] tabular-nums для всех числовых данных
- [ ] Отступы кратны 4px
- [ ] box-shadow Level 1/2/3, не border отдельно (для карточек)
- [ ] border-radius совпадает со стандартом (8/10/12/14/16/20px)
- [ ] Все интерактивные элементы имеют :hover и :focus состояния
- [ ] Focus-ring: box-shadow 0 0 0 3px rgba(12,77,108,.2)
- [ ] Transitions 100–200ms ease, не linear
- [ ] Skeleton для всех загружаемых данных
- [ ] Empty state для пустых списков
- [ ] Toast при любом мутирующем действии
- [ ] Модальные окна через createPortal → document.body
- [ ] z-index согласован: modal 9999, dropdown 99999, toast 99998

---

*Документ является единственным источником истины для UI МОСТОВОЙ OS.*
*При конфликте между кодом и этим документом — документ имеет приоритет.*
*Следующий документ: `07_Pages_Specification.md`*

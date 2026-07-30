# МОСТОВОЙ OS — Development Rules v1.0

> Обязательный стандарт проекта. Соблюдается всеми участниками разработки без исключений.
> Основа: все документы серии `01–08`.
> Статус: Утверждён. Действует с момента создания.
> Код не затронут.

---

## Главное правило проекта

**Никакая новая функция не разрабатывается без:**

1. Соответствующего документа (спецификация в `docs/`)
2. Соответствующего дизайна (утверждённый UI макет)
3. Проверки архитектуры (соответствие `08_Database_Schema.md`)

Нарушение этого правила = задача возвращается на проектирование.
Код, написанный без документа и дизайна, не принимается в PR.

---

## 1. Архитектура проекта Next.js

### 1.1 Версия и конфигурация

- Next.js **App Router** (не Pages Router)
- TypeScript **strict mode** включён
- Tailwind CSS v4
- Supabase SSR клиент (`@supabase/ssr`)
- shadcn/ui как компонентная база
- Recharts для графиков
- Sonner для Toast уведомлений
- Lucide React для иконок

### 1.2 Rendering Strategy

| Тип страницы | Стратегия | Причина |
|-------------|-----------|---------|
| Dashboard | Server Component + Client islands | SEO не нужен, данные чувствительны |
| Таблицы данных | Server Component (initial) + Client (фильтры) | Быстрая первая загрузка |
| Модальные окна | Client Component | Интерактивность |
| Формы | Client Component + Server Action | Мутации через сервер |
| Страницы-оболочки | Server Component | Layout без данных |
| Страница 404/500 | Server Component | Статичные |

### 1.3 Data Fetching

```
Приоритет:
1. Server Component → прямой запрос к Supabase (нет лишних HTTP round-trips)
2. Server Action → для мутаций (create/update/delete)
3. Client-side SWR/React Query → только для real-time данных или polling

Никогда:
- Не вызывать API Route Handler там, где можно Server Component
- Не делать fetch() на клиенте к Supabase напрямую с секретными ключами
```

### 1.4 Supabase клиент

```
Три клиента — для трёх контекстов:
1. createServerClient()  → Server Components, Server Actions, Route Handlers
2. createBrowserClient() → Client Components (только публичные операции)
3. createServiceClient() → Admin операции (только Server-side, никогда клиент)

Service Role Key — только в переменных окружения сервера.
Никогда не передавать в клиентский код.
```

---

## 2. Структура папок

```
mostovoy-crm/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── (auth)/                   # Route group: аутентификация
│   │   │   ├── login/
│   │   │   │   └── page.tsx
│   │   │   └── layout.tsx
│   │   ├── dashboard/                # Route group: основное приложение
│   │   │   ├── layout.tsx            # Sidebar + Topbar wrapper
│   │   │   ├── page.tsx              # Dashboard (redirect → /dashboard/overview)
│   │   │   ├── overview/
│   │   │   │   └── page.tsx          # Dashboard главная
│   │   │   ├── consultations/
│   │   │   │   └── page.tsx
│   │   │   ├── decomposition/
│   │   │   │   ├── page.tsx          # Список декомпозиций
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx      # Декомпозиция сотрудника
│   │   │   ├── finances/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── income/
│   │   │   │   │   └── page.tsx
│   │   │   │   └── expenses/
│   │   │   │       └── page.tsx
│   │   │   ├── salaries/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx
│   │   │   ├── employees/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx
│   │   │   ├── calendar/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx
│   │   │   ├── documents/
│   │   │   │   └── page.tsx
│   │   │   ├── notifications/
│   │   │   │   └── page.tsx
│   │   │   ├── settings/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── company/
│   │   │   │   ├── kpi/
│   │   │   │   ├── plans/
│   │   │   │   ├── salary/
│   │   │   │   └── security/
│   │   │   └── integrations/
│   │   │       └── page.tsx
│   │   ├── api/                      # Route Handlers (только webhooks и integrations)
│   │   │   └── webhooks/
│   │   │       └── telegram/
│   │   │           └── route.ts
│   │   ├── globals.css
│   │   ├── layout.tsx                # Root layout
│   │   └── not-found.tsx
│   │
│   ├── components/                   # Все компоненты
│   │   ├── ui/                       # shadcn/ui базовые (не редактировать)
│   │   │   ├── button.tsx
│   │   │   ├── input.tsx
│   │   │   ├── select.tsx
│   │   │   └── ...
│   │   ├── layout/                   # Layout компоненты
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Topbar.tsx
│   │   │   └── DashboardLayout.tsx
│   │   ├── common/                   # Переиспользуемые по всей системе
│   │   │   ├── Modal.tsx
│   │   │   ├── Drawer.tsx
│   │   │   ├── DataTable.tsx
│   │   │   ├── EmptyState.tsx
│   │   │   ├── LoadingState.tsx
│   │   │   ├── ErrorState.tsx
│   │   │   ├── KpiCard.tsx
│   │   │   ├── ProgressBar.tsx
│   │   │   ├── StatusBadge.tsx
│   │   │   ├── UserAvatar.tsx
│   │   │   ├── ConfirmDialog.tsx
│   │   │   └── PageHeader.tsx
│   │   ├── dashboard/                # Компоненты Dashboard
│   │   │   ├── LeftPanel.tsx
│   │   │   ├── RightPanel.tsx
│   │   │   ├── LiveFeed.tsx
│   │   │   ├── TeamNow.tsx
│   │   │   ├── FinanceBlock.tsx
│   │   │   ├── PlanVsFact.tsx
│   │   │   └── ScheduleBlock.tsx
│   │   ├── consultations/
│   │   │   ├── ConsultationModal.tsx
│   │   │   ├── ConsultationTable.tsx
│   │   │   └── ConsultationFilters.tsx
│   │   ├── decomposition/
│   │   │   ├── DecompositionTable.tsx
│   │   │   ├── PlanModal.tsx
│   │   │   └── AttendanceCalendar.tsx
│   │   ├── employees/
│   │   │   ├── EmployeeCard.tsx
│   │   │   ├── EmployeeModal.tsx
│   │   │   └── EmployeeProfile.tsx
│   │   ├── finances/
│   │   │   ├── FinanceChart.tsx
│   │   │   ├── TransactionModal.tsx
│   │   │   └── CategoryBreakdown.tsx
│   │   └── salaries/
│   │       ├── SalaryTable.tsx
│   │       ├── SalaryDetail.tsx
│   │       └── SalaryCalculation.tsx
│   │
│   ├── actions/                      # Server Actions
│   │   ├── consultations.ts
│   │   ├── employees.ts
│   │   ├── decomposition.ts
│   │   ├── finances.ts
│   │   ├── salaries.ts
│   │   ├── attendance.ts
│   │   └── notifications.ts
│   │
│   ├── hooks/                        # React хуки
│   │   ├── useCurrentUser.ts
│   │   ├── useConsultations.ts
│   │   ├── useEmployees.ts
│   │   ├── useDecomposition.ts
│   │   ├── useFinances.ts
│   │   ├── useRealtimeFeed.ts
│   │   └── useNotifications.ts
│   │
│   ├── lib/                          # Утилиты и конфигурация
│   │   ├── supabase/
│   │   │   ├── client.ts             # createBrowserClient
│   │   │   ├── server.ts             # createServerClient
│   │   │   └── admin.ts              # createServiceClient (server only)
│   │   ├── utils.ts                  # cn(), formatters, helpers
│   │   ├── constants.ts              # Константы системы
│   │   ├── validators.ts             # Zod схемы валидации
│   │   └── formatters.ts             # Форматирование данных
│   │
│   ├── types/                        # TypeScript типы
│   │   ├── index.ts                  # Реэкспорт всех типов
│   │   ├── database.ts               # Суперсет типов из Supabase CLI
│   │   ├── entities.ts               # Бизнес-сущности
│   │   ├── forms.ts                  # Типы форм
│   │   └── api.ts                    # Типы API ответов
│   │
│   └── config/
│       ├── nav.ts                    # Конфигурация навигации
│       └── roles.ts                  # Конфигурация ролей и прав
│
├── docs/                             # Архитектурная документация
│   ├── 01_Vision_Architecture.md
│   ├── 04_Design_System.md
│   ├── 05_Dashboard_Concepts.md
│   ├── 06_UI_Design_System.md
│   ├── 07_Pages_Specification.md
│   ├── 08_Database_Schema.md
│   └── 09_Development_Rules.md      ← этот файл
│
├── supabase/
│   ├── migrations/                   # SQL миграции (по порядку)
│   │   ├── 001_roles.sql
│   │   ├── 002_employees.sql
│   │   └── ...
│   ├── seed.sql                      # Начальные данные
│   └── functions/                    # Edge Functions
│
├── public/
│   └── images/
│
├── .env.local                        # Локальные переменные (в .gitignore)
├── .env.example                      # Шаблон переменных (в репозитории)
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## 3. Naming Convention

### 3.1 Файлы и папки

```
Компоненты React:    PascalCase        → ConsultationModal.tsx
Server Actions:      camelCase         → consultations.ts
Хуки:               camelCase, use*   → useConsultations.ts
Утилиты:            camelCase         → formatters.ts
Страницы:           всегда page.tsx   → page.tsx
Layout:             всегда layout.tsx → layout.tsx
Константы файлы:    camelCase         → constants.ts
Типы файлы:         camelCase         → entities.ts
Папки:              kebab-case        → decomposition/, daily-facts/
```

### 3.2 Переменные и функции

```
Переменные:           camelCase         → const employeeId
Константы:            SCREAMING_SNAKE   → const MAX_SALARY_AMOUNT = 999999
Типы и интерфейсы:    PascalCase        → interface Employee
Enum:                 PascalCase        → enum AttendanceStatus
Boolean переменные:   is/has/can/should → const isLoading, hasPermission
Event handlers:       handle*           → const handleSubmit, handleDelete
Async функции:        описательно       → const fetchEmployees, createConsultation
```

### 3.3 Компоненты

```
Props интерфейс:      {ComponentName}Props  → interface ConsultationModalProps
Внутренние функции:   camelCase             → const formatPhoneNumber
State переменные:     описательное имя      → const [isModalOpen, setIsModalOpen]
Refs:                 camelCase + Ref       → const inputRef, tableRef
```

### 3.4 База данных и API

```
Таблицы Supabase:   snake_case   → employees, daily_facts
Поля:               snake_case   → created_at, employee_id
Функции PG:         snake_case   → get_my_role(), recalculate_decomposition()
Индексы:            idx_{table}_{field} → idx_employees_role
RLS политики:       {action}_{description} → select_own_records
```

### 3.5 CSS / Tailwind

```
Кастомные классы (если нужны): kebab-case → .sidebar-nav-item
CSS переменные:                 --kebab-case → --brand-color
Не создавать кастомные классы там, где хватает Tailwind utility классов.
```

---

## 4. Правила React

### 4.1 Общие

- **Server Component by default.** Добавлять `'use client'` только при необходимости: интерактивность, hooks, browser API.
- Не выносить `'use client'` выше по дереву, чем нужно. Client boundary должна быть как можно ниже.
- Один компонент — одна ответственность.
- Компонент не должен превышать **250 строк**. Если больше — разбить.
- Props drilling более 2 уровней → вынести в context или переосмыслить архитектуру.

### 4.2 Server Components

```
Можно в Server Component:
  - Прямые запросы к Supabase
  - async/await
  - Чтение cookies, headers
  - Переброска на redirect()

Нельзя в Server Component:
  - useState, useEffect, useRef, useCallback
  - Event handlers (onClick, onChange)
  - Browser API (window, document)
  - Context providers (только если сам не использует browser API)
```

### 4.3 Client Components

```
Всегда начинать с: 'use client'

Минимизировать данные, передаваемые с сервера на клиент.
Передавать готовые данные, не raw Supabase response объекты.

Запрещено в Client Component:
  - process.env.SUPABASE_SERVICE_ROLE_KEY
  - Любые серверные секреты
  - Прямые SQL запросы
```

### 4.4 Производительность компонентов

```
React.memo() — только когда есть измеримая проблема с производительностью.
Не оборачивать всё подряд в memo "на всякий случай".

useMemo() — для дорогих вычислений (>5ms), не для простых выражений.

useCallback() — для функций, передаваемых в memo-обёрнутые дочерние компоненты.

key prop — всегда уникальный и стабильный. Никогда не использовать array index
как key если список может меняться.
```

### 4.5 Списки и рендеринг

```
Минимум 3 состояния для любого списка данных:
  1. Loading → Skeleton компонент
  2. Empty   → EmptyState компонент
  3. Data    → реальный список

Обработка ошибок:
  4. Error   → ErrorState компонент

Никогда не показывать пустой экран во время загрузки.
```

---

## 5. Правила TypeScript

### 5.1 Строгость

```json
// tsconfig.json — обязательные флаги
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  }
}
```

### 5.2 Типизация

```
any → ЗАПРЕЩЁН. Исключение: внешние библиотеки без типов (с комментарием // eslint-disable-line).
unknown → использовать вместо any, затем narrowing.
as → type assertion допустим только если невозможно иначе, с комментарием почему.
! (non-null assertion) → ЗАПРЕЩЁН. Использовать guard или опциональную цепочку.
```

### 5.3 Типы сущностей

```
Типы базы данных генерируются через Supabase CLI:
  supabase gen types typescript → src/types/database.ts

Поверх них — бизнес-типы:
  src/types/entities.ts — Employee, Consultation, DailyFact...

Типы форм:
  src/types/forms.ts — отдельно от entity типов

Никогда не использовать inline object types в компонентах.
Всегда выносить в именованный interface или type.
```

### 5.4 Enums и Union Types

```
Предпочитать const объекты + as const вместо enum:
  const ATTENDANCE_STATUS = { WORKED: 'worked', SICK: 'sick' } as const
  type AttendanceStatus = typeof ATTENDANCE_STATUS[keyof typeof ATTENDANCE_STATUS]

Это даёт tree-shaking и лучшую совместимость с JS.
```

### 5.5 Zod для валидации

Все входящие данные (формы, API, Server Actions) валидируются через Zod:
```
src/lib/validators.ts содержит все Zod схемы.
Схема именуется: {Entity}Schema → consultationSchema, employeeSchema.
```

---

## 6. Правила Supabase

### 6.1 Клиенты

```
Server Action / Server Component:
  import { createServerClient } from '@/lib/supabase/server'

Client Component:
  import { createClient } from '@/lib/supabase/client'

Admin операции (только server):
  import { createAdminClient } from '@/lib/supabase/admin'
  Никогда не импортировать в клиентский код.
```

### 6.2 Запросы

```
Всегда деструктурировать: const { data, error } = await supabase...

Всегда обрабатывать error:
  if (error) throw new Error(error.message) // или кастомный error

Никогда не использовать .single() без уверенности, что запись существует.
Использовать .maybeSingle() когда запись может отсутствовать.

Select только нужные поля:
  .select('id, name, role') // не .select('*') в production
  .select('*') допустим только в dev или для простых сущностей

Limit всегда:
  .limit(100) — максимум без пагинации
```

### 6.3 RLS

```
RLS ENABLED на всех таблицах — без исключений.
Никогда не отключать RLS для "быстрого фикса".
Тестировать RLS политики с каждой ролью перед merge.

Обходить RLS через admin client (service role) — только в Server Actions
для системных операций (расчёт зарплаты, cron jobs).
```

### 6.4 Real-time

```
Supabase Realtime — только для:
  - Лента событий Dashboard (consultations)
  - Уведомления (notifications)
  - Статус команды (attendance)

Отписываться в useEffect cleanup:
  return () => { channel.unsubscribe() }

Не создавать несколько каналов на один и тот же ресурс.
```

### 6.5 Миграции

```
Все изменения схемы — только через миграционные файлы в supabase/migrations/.
Именование: {порядковый_номер}_{описание}.sql → 012_add_nv_columns.sql
Никогда не редактировать схему напрямую через UI Supabase в production.
Каждая миграция обратима (иметь план rollback).
```

---

## 7. Правила Server Actions

### 7.1 Структура

```typescript
// src/actions/consultations.ts
'use server'

export async function createConsultation(formData: ConsultationForm): Promise<ActionResult> {
  // 1. Проверка авторизации
  // 2. Валидация данных (Zod)
  // 3. Бизнес-логика
  // 4. Запрос к Supabase
  // 5. Возврат результата
  // 6. revalidatePath() если нужно
}
```

### 7.2 Возвращаемый тип

```typescript
type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }
```

Никогда не выбрасывать необработанные ошибки из Server Action в production.
Всегда возвращать `{ success: false, error: string }`.

### 7.3 Правила

```
Каждый Server Action:
  ✓ Начинается с 'use server'
  ✓ Проверяет авторизацию через createServerClient()
  ✓ Валидирует входные данные через Zod
  ✓ Обрабатывает ошибки Supabase
  ✓ Вызывает revalidatePath() или revalidateTag() после мутации
  ✓ Логирует действие в audit_logs
  ✗ Не содержит бизнес-логику UI (только data operations)
  ✗ Не принимает невалидированные данные
```

### 7.4 Оптимистичные обновления

Для быстрого UX:
```
1. Клиент оптимистично обновляет UI (useOptimistic)
2. Server Action выполняется
3. При ошибке — откат UI
```

---

## 8. Правила API (Route Handlers)

Route Handlers (`app/api/`) используются **только** для:
- Входящих webhooks (Telegram, amoCRM)
- OAuth callbacks
- Публичных endpoints для интеграций

### 8.1 Структура Route Handler

```
Каждый Route Handler:
  ✓ Проверяет метод запроса (GET/POST)
  ✓ Валидирует входящие данные
  ✓ Проверяет подпись webhook (HMAC) если применимо
  ✓ Возвращает корректный HTTP статус
  ✓ Не раскрывает внутренние ошибки во внешних ответах
```

### 8.2 Что НЕ использовать Route Handlers

Не создавать REST API для внутренних запросов.
Для внутренних данных — Server Components + Server Actions.

---

## 9. Правила компонентов

### 9.1 Структура файла компонента

```tsx
// 1. Директива (если нужна)
'use client'

// 2. Импорты: React → Next → external libs → internal → types → styles
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { createConsultation } from '@/actions/consultations'
import type { Consultation } from '@/types/entities'

// 3. Типы пропсов (всегда named interface)
interface ConsultationModalProps {
  consultation?: Consultation
  onClose: () => void
  onSave: () => void
}

// 4. Константы компонента (вне функции)
const INITIAL_FORM_STATE = { ... }

// 5. Сам компонент
export default function ConsultationModal({ consultation, onClose, onSave }: ConsultationModalProps) {
  // 5a. Hooks (порядок: state → refs → context → effects)
  // 5b. Derived state (useMemo если тяжёлое)
  // 5c. Handlers
  // 5d. JSX

  return (...)
}

// 6. Вспомогательные функции (после компонента, если не нужны снаружи)
function formatPhoneNumber(phone: string): string { ... }
```

### 9.2 Props

```
Деструктурировать props в сигнатуре функции.
Не использовать props.field внутри компонента.
Дефолтные значения — через деструктуризацию: { isOpen = false }
Callback props называть: on{Event} → onClose, onSave, onChange
```

### 9.3 Размер и сложность

```
Компонент > 250 строк → разбить на меньшие.
JSX вложенность > 5 уровней → вынести в отдельный компонент.
Условная логика > 3 веток → вынести в отдельный компонент или утилиту.
```

### 9.4 Запрещено в компонентах

```
✗ console.log() в production коде
✗ Инлайн стили (style={{}}) — только Tailwind классы
✗ Магические числа — только именованные константы
✗ Захардкоженные строки интерфейса — использовать константы
✗ Прямые вызовы Supabase из Client Component
✗ setTimeout/setInterval без cleanup
```

---

## 10. Правила хуков

### 10.1 Кастомные хуки

```
Называть: use{Purpose} → useConsultations, useCurrentUser
Хранить в: src/hooks/
Один хук — одна ответственность.
Возвращать объект (не массив) если больше 2 значений:
  return { data, isLoading, error, refetch }
```

### 10.2 useEffect

```
✓ Всегда указывать dependency array
✓ Всегда возвращать cleanup функцию если есть подписки
✓ Комментировать нетривиальный dependency array
✗ Не делать данные-запросы в useEffect (использовать Server Component или SWR)
✗ Не ставить объекты/массивы в deps без useMemo/useCallback
```

### 10.3 useState

```
Группировать связанные состояния в один объект:
  const [form, setForm] = useState({ name: '', phone: '' })
  — не делать отдельный useState для каждого поля формы

Исключение: независимые UI состояния:
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
```

---

## 11. Правила UI

### 11.1 Design System как источник истины

Весь UI строится по `06_UI_Design_System.md`.
При конфликте между кодом и Design System — Design System имеет приоритет.

### 11.2 Цвета

```
Только токены из Design System. Запрещено:
  ✗ Инлайн HEX: className="text-[#0c2136]"  → использовать className="text-brand-dark"
  ✗ Tailwind arbitrary values для brand цветов

Допустимо arbitrary values только для:
  - z-index: z-[9999]
  - Специфичные размеры: w-[192px]
```

### 11.3 Tailwind

```
Порядок классов (следовать Prettier Tailwind plugin):
  Layout → Sizing → Spacing → Typography → Colors → Border → Effects → Transitions

Не дублировать классы. Если одна и та же комбинация встречается 3+ раз → вынести в компонент.

Адаптивность: mobile-first. sm: md: lg: xl:

Dark mode: dark: префикс (когда будет реализован)
```

### 11.4 Иконки

```
Только Lucide React. Размеры: 14px / 16px / 20px / 24px.
Передавать size как число: <Icon size={16} />
Добавлять aria-label на иконках без текста.
```

### 11.5 Анимации

```
Все transition: duration-150 или duration-200. Не длиннее 300ms для UI элементов.
Модальные окна: 200ms ease-out появление.
Hover states: 100-150ms.
Не использовать CSS animations для loading — использовать Skeleton компонент.
```

---

## 12. Правила форм

### 12.1 Структура

```
Формы используют:
  - React controlled components (value + onChange)
  - Zod валидация на уровне Server Action
  - Клиентская pre-валидация (опционально, для UX)

Не использовать react-hook-form без веской причины.
Текущий подход: useState + Server Action + Zod достаточен для MVP.
```

### 12.2 Валидация

```
Клиентская: базовые проверки (required, длина, формат)
Серверная:  Zod схема в Server Action — обязательна всегда

Ошибки показывать:
  - Под каждым полем индивидуально
  - Toast для общей ошибки сабмита
  - Поле с ошибкой: красная граница + сообщение под полем
```

### 12.3 UX форм

```
Submit кнопка:
  - disabled во время отправки
  - Текст меняется: "Сохранить" → "Сохранение..."
  - Spinner рядом с текстом

После успешного сохранения:
  - Toast success
  - Закрытие Modal/Drawer
  - revalidatePath → обновление данных

После ошибки:
  - Toast error
  - Форма остаётся открытой с данными
  - Поля с ошибками подсвечены
```

### 12.4 Специфичные поля

```
Телефон: +996 автопрефикс, форматирование XXX XXX-XX-XX
Деньги: числовой input, min=0, 2 decimal places, суффикс "KGS"
Номер сделки: # префикс, только цифры, max 7 знаков
Дата: стандартный date picker, не текстовый input
Время: стандартный time picker, шаг 30 мин по умолчанию
```

---

## 13. Правила таблиц

### 13.1 Структура DataTable

```
Обязательные состояния:
  1. Loading → Skeleton (5 строк)
  2. Empty   → EmptyState с кнопкой действия
  3. Error   → ErrorState с "Попробовать снова"
  4. Data    → таблица

Обязательные функции:
  - Сортировка по заголовку колонки (минимум по дате)
  - Пагинация или infinite scroll
  - Поиск (если > 20 записей ожидается)
  - Фильтры (если применимо)
```

### 13.2 Отображение данных

```
Числа: tabular-nums, right-aligned
Пустые значения: "—" (em dash), цвет: #d1d5db
Даты: формат "21 июн 2025" или "21.06.2025" (консистентно по проекту)
Деньги: с разделителем тысяч: "24 500 KGS"
Проценты: одним знаком после запятой: "36.4%"
Имена: без обрезки на маленьких экранах (overflow-hidden допустим только для очень длинных)
```

### 13.3 Hover и действия

```
Hover строки: background rgba(0,0,0,.02)
Кнопки действий (edit/delete): скрыты → появляются при hover строки
  opacity-0 group-hover:opacity-100 transition-opacity
Клик на строку → Modal редактирования (если применимо)
```

---

## 14. Правила ошибок

### 14.1 Иерархия обработки

```
1. Zod валидация → ошибки полей формы
2. Supabase error → преобразовать в user-friendly сообщение
3. Network error → "Проблема с соединением. Попробуйте снова."
4. Unexpected error → "Что-то пошло не так." + log в console.error
5. Fatal error → error.tsx страница Next.js
```

### 14.2 Пользовательские сообщения

```
Русский язык для всех сообщений об ошибках.
Конкретные и действенные: не "Ошибка", а "Не удалось сохранить запись. Попробуйте снова."
Не раскрывать технические детали пользователю (stacktrace, SQL ошибки).
Логировать полный error объект в console.error для отладки.
```

### 14.3 Error Boundaries

```
Оборачивать в Error Boundary:
  - Каждая основная секция Dashboard
  - Каждый модальный контент
  - Таблицы с динамическими данными

Не оборачивать: статичные layout компоненты, Sidebar, Topbar.
```

---

## 15. Правила логирования

### 15.1 В development

```
console.log()   → допустим в dev, удалять перед commit
console.error() → всегда для ошибок
console.warn()  → для предупреждений
```

### 15.2 В production

```
console.log()  → ЗАПРЕЩЁН (ESLint правило)
console.error() → только для критических ошибок
Аудит действий → через Server Action → audit_logs таблица
```

### 15.3 Audit Log

```
Логировать в audit_logs:
  ✓ Создание / изменение / удаление любой записи
  ✓ Вход / выход из системы
  ✓ Экспорт данных
  ✓ Изменение настроек
  ✓ Расчёт зарплаты

Не логировать:
  ✗ Чтение данных (SELECT запросы)
  ✗ Навигация по страницам
```

---

## 16. Правила безопасности

### 16.1 Переменные окружения

```
Публичные (доступны клиенту):    NEXT_PUBLIC_SUPABASE_URL
                                  NEXT_PUBLIC_SUPABASE_ANON_KEY

Серверные (только server-side):  SUPABASE_SERVICE_ROLE_KEY
                                  Любые API ключи интеграций

.env.local → в .gitignore (никогда не коммитить)
.env.example → в репозитории (без значений)
```

### 16.2 Input Sanitization

```
Все пользовательские данные валидировать через Zod на сервере.
Телефон: хранить только цифры в БД, форматировать при отображении.
HTML input: экранировать перед сохранением (Supabase параметризированные запросы делают это автоматически).
```

### 16.3 Аутентификация и авторизация

```
Каждый Server Action:
  1. Проверить auth.uid() через createServerClient()
  2. Проверить роль через get_my_role()
  3. Только потом выполнять операцию

Никогда не доверять данным из клиента о роли пользователя.
Роль проверять через БД, не через localStorage или cookies.

Route protection:
  middleware.ts перехватывает все запросы к /dashboard/*
  Редирект на /login если нет сессии
```

### 16.4 RLS как второй уровень защиты

```
RLS — обязательный второй уровень после Server Action проверки.
Если Server Action пропустит проверку → RLS заблокирует.
Тестировать оба уровня независимо.
```

### 16.5 Чувствительные данные

```
Не логировать: пароли, API ключи, телефоны клиентов, суммы сделок.
В audit_logs → маскировать чувствительные поля: phone → "+996 XXX XXX-**-**"
Зарплаты и финансы — доступны только owner и accountant (RLS).
```

---

## 17. Правила производительности

### 17.1 Database

```
Каждый SELECT с WHERE → должен использовать индекс.
Перед добавлением нового запроса → проверить EXPLAIN в Supabase.
N+1 проблема → использовать JOIN или вложенные select в одном запросе.
Пагинация → всегда, если записей может быть > 50.
```

### 17.2 Frontend

```
Изображения: next/image, не <img>
Шрифты: next/font, не @import в CSS
Dynamic imports: для тяжёлых компонентов (charts, editors)
  const FinanceChart = dynamic(() => import('@/components/finances/FinanceChart'), { ssr: false })

Bundle size: не импортировать целые библиотеки если нужна одна функция.
  ✗ import _ from 'lodash'
  ✓ import { debounce } from 'lodash'
  ✓✓ написать свою утилиту вместо lodash
```

### 17.3 Caching

```
revalidatePath() — после каждой мутации на нужных путях.
Статичные данные (roles, settings) — cache: 'force-cache' или ISR revalidate.
Динамичные данные (consultations) — no-store или revalidate: 0.
```

---

## 18. Правила Code Review

### 18.1 Что проверять в PR

```
Архитектура:
  □ Соответствует ли решение документам (07, 08, 09)?
  □ Нет ли нарушений Design System (06)?
  □ Правильно ли выбрана rendering strategy (SC vs CC)?

Безопасность:
  □ Все Server Actions проверяют auth.uid()?
  □ RLS политики актуальны?
  □ Нет утечки серверных секретов?

Качество кода:
  □ Нет any типов?
  □ Нет console.log?
  □ Нет хардкода строк и чисел?
  □ Компоненты ≤ 250 строк?

UI:
  □ Все три состояния реализованы (loading/empty/data)?
  □ Используются Design System токены?
  □ Responsiveness проверена?

Тесты:
  □ Новая логика покрыта (если unit-тест применим)?
```

### 18.2 Процесс ревью

```
Автор PR:
  1. Заполняет PR описание по шаблону
  2. Прогоняет чеклист (см. раздел 21)
  3. Назначает ревьюера

Ревьюер:
  1. Проверяет по чеклисту раздела 18.1
  2. Оставляет комментарии (не approve с ошибками)
  3. Approve только после устранения всех критических замечаний
```

---

## 19. Definition of Done

Задача считается **завершённой** только если выполнены все пункты:

```
□ 1. Документ создан или обновлён (docs/)
□ 2. Дизайн утверждён (UI макет в документе или в чате)
□ 3. Архитектура проверена (соответствие 08_Database_Schema.md)
□ 4. Код написан согласно правилам этого документа
□ 5. TypeScript компилируется без ошибок (tsc --noEmit)
□ 6. ESLint не выдаёт ошибок (next lint)
□ 7. Функциональность протестирована вручную (все сценарии)
□ 8. Все три состояния UI реализованы (loading/empty/data/error)
□ 9. Мобильная верстка не сломана (если применимо)
□ 10. Аудит-лог работает (действия записываются)
□ 11. RLS протестирован для каждой роли
□ 12. Commit checklist пройден
□ 13. PR checklist пройден
□ 14. Code Review пройден
□ 15. Код смержен в main
```

---

## 20. Checklist перед каждым Commit

```
□ git diff просмотрен — нет случайных изменений
□ Нет console.log() в production коде
□ Нет закомментированного кода (удалить или объяснить)
□ Нет .env значений и секретов
□ TypeScript: tsc --noEmit — нет ошибок
□ ESLint: next lint — нет ошибок
□ Нет TODO/FIXME без привязки к задаче
□ Commit message по формату:

  Формат: {type}: {описание на русском языке}

  Типы:
    feat:     новая функциональность
    fix:      исправление бага
    refactor: рефакторинг без изменения функциональности
    docs:     изменение документации
    style:    форматирование (не CSS)
    chore:    зависимости, конфиг, CI
    db:       изменение миграций или схемы

  Примеры:
    feat: добавить inline редактирование факта в декомпозиции
    fix: исправить z-index dropdown в модальном окне
    db: добавить поля nv_sales_fact и nv_revenue_fact
    docs: обновить спецификацию страницы Финансов
```

---

## 21. Checklist перед Pull Request

```
Описание PR:
  □ Заголовок: краткий (до 70 символов)
  □ Что изменено и зачем (2-5 bullet points)
  □ Какие страницы/компоненты затронуты
  □ Скриншоты или видео (для UI изменений)
  □ Ссылка на задачу / документ

Код:
  □ Все файлы из diff нужны (нет случайных)
  □ Нет debug кода
  □ Нет вещей, которые "потом доделаю"
  □ Нет breaking changes без предупреждения

База данных:
  □ Новые таблицы/поля добавлены в 08_Database_Schema.md
  □ Миграционный файл создан (если изменилась схема)
  □ RLS политики обновлены

UI/UX:
  □ Соответствует утверждённому дизайну
  □ Проверено в Chrome
  □ Нет регрессий в существующем UI

Безопасность:
  □ Нет секретов в коде
  □ Server Actions проверяют авторизацию
  □ RLS работает для всех ролей

Definition of Done:
  □ Все 15 пунктов DoD выполнены
```

---

## 22. Checklist перед Release

```
Подготовка:
  □ Все запланированные задачи в статусе Done
  □ Все PR смержены в main
  □ CHANGELOG обновлён (описание изменений)
  □ Версия обновлена в package.json

База данных:
  □ Все миграции применены в production Supabase
  □ Seed данные актуальны
  □ Backup сделан до деплоя
  □ RLS политики протестированы в production-like окружении

Тестирование:
  □ Smoke test всех основных сценариев
    - Вход в систему (все роли)
    - Создание записи на консультацию
    - Просмотр декомпозиции
    - Dashboard загружается без ошибок
    - Финансы отображаются корректно
  □ Проверка на реальных данных

Производительность:
  □ Dashboard загружается < 3 секунды
  □ Таблицы с 100+ записями работают корректно
  □ Нет memory leak в real-time подписках

Безопасность:
  □ МП не видит данные других МП
  □ МП не видит финансы
  □ Анонимный пользователь → редирект на /login

Мониторинг:
  □ Supabase error logs проверены (нет аномалий)
  □ Vercel функции работают без ошибок

После деплоя:
  □ Проверить /dashboard в production
  □ Проверить вход с каждой ролью
  □ Уведомить команду о выходе версии
  □ Мониторинг первые 30 минут после деплоя
```

---

## Приложение: Запрещённые практики (Anti-patterns)

Следующее запрещено в кодовой базе без исключений:

```
✗ any тип TypeScript
✗ console.log() в production
✗ Инлайн стили style={{}}
✗ Прямые обращения к Supabase из Client Component с service key
✗ SELECT * в production запросах
✗ Отключение RLS на любой таблице
✗ Hardcoded URL (кроме constants.ts)
✗ Магические числа (кроме 0 и 1)
✗ Коммит с незакрытыми TypeScript ошибками
✗ Разработка функции без документа и дизайна
✗ Изменение схемы БД без миграционного файла
✗ Мутации в Server Component (только в Server Action)
✗ Импорт server-only модулей в Client Component
✗ useEffect для data fetching (только Server Component или SWR)
✗ index как key в .map() для динамических списков
✗ ! (non-null assertion) operator
✗ Игнорирование error из Supabase запроса
```

---

## Приложение: Переменные окружения

```bash
# .env.example (коммитить без значений)

# Supabase (публичные — доступны клиенту)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Supabase (серверные — только server-side)
SUPABASE_SERVICE_ROLE_KEY=

# App
NEXT_PUBLIC_APP_URL=

# Integrations (добавлять по мере подключения)
# TELEGRAM_BOT_TOKEN=
# AMOCRM_API_KEY=
```

---

*Этот документ является обязательным стандартом проекта МОСТОВОЙ OS.*
*При любом конфликте между практикой и этим документом — документ имеет приоритет.*
*Документ обновляется при изменении стандартов — с указанием версии и даты.*
*Версия 1.0 · Июнь 2025*

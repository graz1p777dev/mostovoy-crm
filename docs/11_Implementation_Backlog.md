# МОСТОВОЙ OS — Implementation Backlog v1.0

> Единственный источник правды для управления разработкой.
> Основа: все документы `01–10` серии docs/.
> Принцип: никакая задача не начинается без документа, дизайна и проверки архитектуры.
> Статус: Утверждён. Разработка ведётся строго по этому документу.

---

## Приоритеты

| Приоритет | Значение |
|-----------|---------|
| **P0** | Критический блокер. Без этого система не работает. Первый Sprint. |
| **P1** | Высокий. MVP функциональность. Выпускается в первых релизах. |
| **P2** | Средний. Важно, но не блокирует MVP. |
| **P3** | Низкий. Будущее развитие. |

## Модули

| Код | Модуль |
|-----|--------|
| INFRA | Инфраструктура (БД, Auth, конфиг) |
| CORE | Ядро (Layout, Sidebar, Topbar, типы) |
| DASH | Dashboard |
| CONS | Консультации |
| DECOMP | Декомпозиция |
| EMP | Сотрудники |
| FIN | Финансы |
| SAL | Зарплаты |
| CAL | Рабочий календарь |
| NOTIF | Уведомления |
| DOC | Документы |
| SET | Настройки |
| INT | Интеграции |

---

## Раздел 1: INFRA — Инфраструктура

---

### INFRA-01 · Применение миграций в Supabase
**Модуль:** INFRA  
**Приоритет:** P0  
**Оценка:** 1ч  
**Зависимости:** нет  
**Документы:** `08_Database_Schema.md`, `supabase/migrations/README.md`  

**Что делаем:**
Применить все 20 SQL-миграций к production Supabase проекту `rjzmxgiqleftwcsxgfte`.
Проверить создание таблиц, функций, триггеров, RLS политик, Storage buckets, seed данных.

**Затронута БД:** ✅ да  
**Затронут UI:** ❌ нет  
**Затронута бизнес-логика:** ✅ да (функции и триггеры)

**Критерии готовности:**
- [ ] Все 24 таблицы созданы
- [ ] Все 4 функции (`get_my_role`, `get_my_employee_id`, `recalculate_decomposition`, `calculate_salary`) существуют
- [ ] Все триггеры активны
- [ ] RLS включён на всех таблицах
- [ ] 3 Storage bucket созданы (avatars, logos, documents)
- [ ] Seed данные вставлены (роли, категории, настройки, шаблоны KPI)

**Тесты после завершения:**
- SQL: `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'` → 24 таблицы
- SQL: `SELECT name FROM pg_proc WHERE proname IN ('get_my_role','get_my_employee_id')` → 2 строки
- Supabase Dashboard → Storage → проверить 3 bucket'а

---

### INFRA-02 · Создание первого пользователя (Владелец)
**Модуль:** INFRA  
**Приоритет:** P0  
**Оценка:** 0.5ч  
**Зависимости:** INFRA-01  
**Документы:** `08_Database_Schema.md` (employees), `09_Development_Rules.md` (безопасность)  

**Что делаем:**
Через Supabase Auth Dashboard создать первого пользователя.
Добавить запись в `employees` с `role = 'owner'` и корректным `user_id`.
Проверить что RLS работает корректно для этого пользователя.

**Затронута БД:** ✅ да  
**Затронут UI:** ❌ нет  
**Затронута бизнес-логика:** ❌ нет

**Критерии готовности:**
- [ ] Пользователь создан в auth.users
- [ ] Запись в employees: `role = 'owner'`, `user_id` заполнен
- [ ] `SELECT public.get_my_role()` возвращает 'owner' при авторизации
- [ ] Вход в систему работает

**Тесты после завершения:**
- Открыть приложение → вход → перенаправление на /dashboard

---

### INFRA-03 · Настройка переменных окружения
**Модуль:** INFRA  
**Приоритет:** P0  
**Оценка:** 0.5ч  
**Зависимости:** INFRA-01  
**Документы:** `09_Development_Rules.md` (раздел переменные окружения)  

**Что делаем:**
Создать/обновить `.env.local` со всеми переменными.
Проверить `.env.example` — должен быть в репозитории без значений.
Убедиться что `SUPABASE_SERVICE_ROLE_KEY` не в `.env.example`.

**Затронута БД:** ❌ нет  
**Затронут UI:** ❌ нет  
**Затронута бизнес-логика:** ❌ нет

**Критерии готовности:**
- [ ] `.env.local` содержит все необходимые переменные
- [ ] `.env.local` в `.gitignore`
- [ ] `.env.example` без значений, в репозитории
- [ ] `next dev` запускается без ошибок

---

### INFRA-04 · Обновление Supabase клиентов
**Модуль:** INFRA  
**Приоритет:** P0  
**Оценка:** 1ч  
**Зависимости:** INFRA-01, INFRA-03  
**Документы:** `09_Development_Rules.md` (правила Supabase)  

**Что делаем:**
Обновить/создать три Supabase клиента согласно правилам из 09:
- `src/lib/supabase/client.ts` → `createBrowserClient()`
- `src/lib/supabase/server.ts` → `createServerClient()` (с cookies)
- `src/lib/supabase/admin.ts` → `createServiceClient()` (service role key)

Удалить старые `src/lib/supabase.ts` и `src/lib/supabase-server.ts` после переноса.

**Затронута БД:** ❌ нет  
**Затронут UI:** ✅ (импорты во всех компонентах)  
**Затронута бизнес-логика:** ❌ нет

**Критерии готовности:**
- [ ] 3 клиента созданы в `src/lib/supabase/`
- [ ] Старые файлы удалены
- [ ] Все существующие импорты обновлены
- [ ] `tsc --noEmit` без ошибок
- [ ] Приложение запускается

---

### INFRA-05 · Обновление TypeScript типов
**Модуль:** INFRA  
**Приоритет:** P0  
**Оценка:** 2ч  
**Зависимости:** INFRA-01, INFRA-04  
**Документы:** `08_Database_Schema.md`, `09_Development_Rules.md` (правила TypeScript)  

**Что делаем:**
Обновить `src/types/index.ts` — привести все типы в соответствие с реальной БД.
Создать `src/types/entities.ts` с новыми бизнес-типами:
- `Employee` (с полями из 08: role, status, schedule_type...)
- `Consultation` (с полями из 08: status/actual_status/status_after_fv...)
- `DashboardMonthStats`, `DashboardTodayStats`
- `LiveFeedItem`, `TeamMemberStatus`
- Все остальные сущности из 08

Создать `src/types/forms.ts` — типы форм для каждого модуля.

**Затронута БД:** ❌ нет  
**Затронут UI:** ✅ (типы используются везде)  
**Затронута бизнес-логика:** ❌ нет

**Критерии готовности:**
- [ ] Нет `any` типов в новых определениях
- [ ] Роли: `owner/rop/mp/lmai/accountant` (не старые manager/employee)
- [ ] Все поля из схемы типизированы
- [ ] `tsc --noEmit` без ошибок
- [ ] Обратная совместимость с существующими страницами

---

### INFRA-06 · Утилиты: форматтеры и константы
**Модуль:** INFRA  
**Приоритет:** P0  
**Оценка:** 1ч  
**Зависимости:** нет  
**Документы:** `06_UI_Design_System.md`, `08_Database_Schema.md`  

**Что делаем:**
Создать `src/lib/formatters.ts`:
- `formatMoney(amount)` → "24 500 KGS"
- `formatPercent(value)` → "36.5%"
- `formatDate(date)` → "21 июн"
- `formatDateFull(date)` → "21 июня 2025"
- `formatTime(time)` → "14:30"
- `formatPhone(phone)` → "+996 XXX XXX-XX-XX"
- `getInitials(name)` → "СМ"
- `getDayGreeting()` → "Доброе утро/день/вечер"

Создать `src/lib/constants.ts`:
- `CONSULTATION_STATUSES` с цветами и лейблами
- `ATTENDANCE_STATUSES`
- `EMPLOYEE_ROLES`
- `SALARY_STATUSES`

**Затронута БД:** ❌ нет  
**Затронут UI:** ✅ используется везде  
**Затронута бизнес-логика:** ❌ нет

**Критерии готовности:**
- [ ] `formatMoney(24500)` → `"24 500 KGS"`
- [ ] `formatPercent(36.4567)` → `"36.5%"`
- [ ] Все функции типизированы
- [ ] Цвета статусов — из Design System (не произвольные)

---

## Раздел 2: CORE — Ядро приложения

---

### CORE-01 · Редизайн Sidebar
**Модуль:** CORE  
**Приоритет:** P0  
**Оценка:** 2ч  
**Зависимости:** INFRA-05  
**Документы:** `06_UI_Design_System.md` (Sidebar), `07_Pages_Specification.md` (навигация)  

**Что делаем:**
Полностью переписать `src/components/Sidebar.tsx`:
- Фон: `#0c1f33` (не gray-950)
- Ширина: 192px
- Логотип: DR марка на `#0c4d6c`
- Навигация с ролями `owner/rop/mp/lmai/accountant`
- Активный пункт: `#0c4d6c` фон, белый текст
- Hover: `rgba(255,255,255,0.06)`
- Иконки: 16px, `#a2b4c0` → белый при активном
- Пользовательский блок внизу: аватар + имя + роль + выход
- Вынести конфиг навигации в `src/config/nav.ts`

**Затронута БД:** ❌ нет  
**Затронут UI:** ✅ глобально  
**Затронута бизнес-логика:** ❌ нет

**Критерии готовности:**
- [ ] Цвет `#0c1f33`, ширина 192px
- [ ] Активный пункт `#0c4d6c` (не фиолетовый)
- [ ] Каждая роль видит правильные пункты
- [ ] Существующие страницы не сломаны
- [ ] Нет горизонтальной прокрутки

---

### CORE-02 · Topbar
**Модуль:** CORE  
**Приоритет:** P0  
**Оценка:** 2ч  
**Зависимости:** CORE-01, INFRA-05  
**Документы:** `06_UI_Design_System.md` (Topbar), `10_Dashboard_Implementation_Plan.md` (задача 1.2)  

**Что делаем:**
Создать `src/components/layout/Topbar.tsx`:
- Высота 52px, `backdrop-filter: blur(12px)`
- Фон: `rgba(255,255,255,0.85)`
- Слева: breadcrumb (название страницы)
- Центр: `⌘K` — быстрый поиск хинт
- Справа: дата (рус.) + зелёный индикатор онлайн + колокол (badge) + аватар

Обновить `src/app/dashboard/layout.tsx` — добавить Topbar.

**Затронута БД:** ✅ `notifications` (COUNT для badge)  
**Затронут UI:** ✅  
**Затронута бизнес-логика:** ❌

**Критерии готовности:**
- [ ] Topbar sticky, не перекрывает контент
- [ ] Badge на колоколе показывает кол-во непрочитанных (0 — не показывает)
- [ ] Дата на русском
- [ ] Backdrop blur работает
- [ ] Нет сдвига layout

---

### CORE-03 · Dashboard Layout структура (Split Focus)
**Модуль:** CORE  
**Приоритет:** P0  
**Оценка:** 1ч  
**Зависимости:** CORE-01, CORE-02  
**Документы:** `05_Dashboard_Concepts.md` (Concept C), `10_Dashboard_Implementation_Plan.md` (задача 1.3)  

**Что делаем:**
Переписать `src/app/dashboard/page.tsx` — только структура:
- Убрать старый фиолетовый код
- Left panel: `bg-white`, 55% ширины, `border-r border-[#e5e7eb]`
- Right panel: `bg-[#f5f6f8]`, 45% ширины
- Обе панели: `overflow-y-auto`, `calc(100vh - 52px)`
- На `< xl`: вертикальное стекирование
- Заглушки-placeholder для каждого блока

**Затронута БД:** ❌  
**Затронут UI:** ✅  
**Затронута бизнес-логика:** ❌

**Критерии готовности:**
- [ ] Двухпанельный layout работает
- [ ] Панели прокручиваются независимо
- [ ] На `< 1280px`: вертикальное стекирование
- [ ] Нет горизонтальной прокрутки
- [ ] Старый код полностью удалён

---

### CORE-04 · AuthContext обновление
**Модуль:** CORE  
**Приоритет:** P0  
**Оценка:** 1.5ч  
**Зависимости:** INFRA-01, INFRA-04, INFRA-05  
**Документы:** `08_Database_Schema.md` (employees), `09_Development_Rules.md`  

**Что делаем:**
Обновить `src/contexts/AuthContext.tsx`:
- Читать профиль из `employees` (не из `profiles`)
- Поля: `id, user_id, name, email, role, avatar_url, department_id, status`
- Обработка случая когда `employees` запись не найдена
- Обновить тип `User` → `Employee` (из новых типов)

**Затронута БД:** ✅ `employees`  
**Затронут UI:** ✅ (AuthContext используется везде)  
**Затронута бизнес-логика:** ❌

**Критерии готовности:**
- [ ] `user.role` возвращает `owner/rop/mp/lmai/accountant`
- [ ] При отсутствии записи в employees → корректный logout
- [ ] `tsc --noEmit` без ошибок
- [ ] Вход/выход работает

---

### CORE-05 · Middleware — защита маршрутов
**Модуль:** CORE  
**Приоритет:** P0  
**Оценка:** 1ч  
**Зависимости:** INFRA-04  
**Документы:** `09_Development_Rules.md` (безопасность), `07_Pages_Specification.md` (роли)  

**Что делаем:**
Создать/обновить `middleware.ts`:
- Все маршруты `/dashboard/*` требуют авторизации
- Нет сессии → redirect `/auth/login`
- Бухгалтер на `/dashboard` → redirect `/dashboard/finances`
- Проверка через `createServerClient()` + Supabase session

**Затронута БД:** ❌  
**Затронут UI:** ❌ (только редиректы)  
**Затронута бизнес-логика:** ❌

**Критерии готовности:**
- [ ] Неавторизованный пользователь → `/auth/login`
- [ ] Авторизованный → `/dashboard`
- [ ] Бухгалтер → `/dashboard/finances`
- [ ] Нет бесконечных редиректов

---

## Раздел 3: DASH — Dashboard

---

### DASH-01 · Dashboard: запросы данных за месяц
**Модуль:** DASH  
**Приоритет:** P0  
**Оценка:** 2ч  
**Зависимости:** INFRA-01, INFRA-04, INFRA-05  
**Документы:** `08_Database_Schema.md`, `10_Dashboard_Implementation_Plan.md` (задача 2.1)  

**Что делаем:**
Создать `src/lib/dashboard-queries.ts`:
```
getMonthKpiStats(supabase, year, month, employeeId?) → { fv, sales, revenue, kpiPct }
getMonthPlanStats(supabase, year, month, employeeId?) → { planFv, planSales, planRevenue }
getRevenueByWeeks(supabase, year, month) → Array<{ week, revenue }>
getPlanVsFactTable(supabase, year, month) → Array<EmployeePlanFact>
```

**Затронута БД:** ✅ `consultations`, `decomposition`, `employee_kpi`, `employees`  
**Затронут UI:** ❌  
**Затронута бизнес-логика:** ✅ логика агрегации

**Критерии готовности:**
- [ ] Все функции типизированы, нет `any`
- [ ] Работают при пустой БД (возвращают нули)
- [ ] Нет N+1 запросов
- [ ] Фильтрация по роли (`employeeId` для mp/lmai)

---

### DASH-02 · Dashboard: KPI карточки месяца
**Модуль:** DASH  
**Приоритет:** P0  
**Оценка:** 2ч  
**Зависимости:** DASH-01, INFRA-06  
**Документы:** `06_UI_Design_System.md` (KPI Card), `10_Dashboard_Implementation_Plan.md` (задача 2.2)  

**Что делаем:**
Создать:
- `src/components/common/KpiCard.tsx` — переиспользуемая карточка
- `src/components/common/KpiCardSkeleton.tsx` — skeleton
- `src/components/dashboard/MonthKpiCards.tsx` — сетка 4 карточек: ФВ / Продажи / Выручка / KPI%

Дизайн: нет border, только box-shadow, прогресс-бар 2px с цветами по порогам.

**Затронута БД:** ✅ через DASH-01  
**Затронут UI:** ✅  
**Затронута бизнес-логика:** ❌

**Критерии готовности:**
- [ ] 4 карточки в сетке 2×2
- [ ] Прогресс-бар: danger/warning/brand/success по % порогам
- [ ] Нет фиолетовых цветов
- [ ] Числа tabular-nums
- [ ] Skeleton занимает то же место что реальный контент
- [ ] При `value = 0` карточка не ломается

---

### DASH-03 · Dashboard: Revenue by Weeks chart
**Модуль:** DASH  
**Приоритет:** P1  
**Оценка:** 1.5ч  
**Зависимости:** DASH-01, INFRA-06  
**Документы:** `06_UI_Design_System.md` (Charts / Recharts)  

**Что делаем:**
Создать `src/components/dashboard/RevenueWeeksChart.tsx`:
- BarChart (Recharts) — выручка по неделям месяца
- Цвет баров: `#0c4d6c`
- Tooltip: `formatMoney`
- EmptyState при нулевых данных

**Затронута БД:** ✅ `consultations`  
**Затронут UI:** ✅  
**Затронута бизнес-логика:** ❌

**Критерии готовности:**
- [ ] Chart рендерится без ошибок
- [ ] Данные группируются по неделям корректно
- [ ] `ResponsiveContainer` заполняет ширину
- [ ] EmptyState при пустых данных

---

### DASH-04 · Dashboard: Plan vs Fact таблица
**Модуль:** DASH  
**Приоритет:** P0  
**Оценка:** 2ч  
**Зависимости:** DASH-01, INFRA-05, INFRA-06  
**Документы:** `06_UI_Design_System.md` (таблицы), `07_Pages_Specification.md` (Dashboard)  

**Что делаем:**
Создать `src/components/dashboard/PlanVsFactTable.tsx`:
- Колонки: Сотрудник | ФВ п/ф | Продажи п/ф | Выручка | KPI%
- Hover строки, tabular-nums, пустые "—"
- KPI% badge с цветом
- Ролевая фильтрация (РОП видит команду, МП только себя)

**Затронута БД:** ✅ `employees`, `decomposition`, `employee_kpi`  
**Затронут UI:** ✅  
**Затронута бизнес-логика:** ❌

**Критерии готовности:**
- [ ] Ролевая фильтрация работает корректно
- [ ] Числа tabular-nums, right-aligned
- [ ] Пустые значения показывают "—"
- [ ] При 0 сотрудниках: EmptyState

---

### DASH-05 · Dashboard: Left Panel (сборка)
**Модуль:** DASH  
**Приоритет:** P0  
**Оценка:** 1ч  
**Зависимости:** DASH-02, DASH-03, DASH-04  
**Документы:** `10_Dashboard_Implementation_Plan.md` (задача 2.5)  

**Что делаем:**
Создать `src/components/dashboard/LeftPanel.tsx` (Server Component):
- Загружает все данные за месяц через `dashboard-queries.ts`
- Компонует: заголовок + MonthKpiCards + RevenueWeeksChart + PlanVsFactTable
- `<Suspense fallback={<LeftPanelSkeleton />}>`

Создать `src/components/dashboard/LeftPanelSkeleton.tsx`.

**Затронута БД:** ✅  
**Затронут UI:** ✅  
**Затронута бизнес-логика:** ❌

**Критерии готовности:**
- [ ] Все данные загружаются через `Promise.all`
- [ ] Suspense работает — skeleton виден при загрузке
- [ ] Ошибка одного блока не роняет всю панель

---

### DASH-06 · Dashboard: запросы данных за сегодня
**Модуль:** DASH  
**Приоритет:** P0  
**Оценка:** 1.5ч  
**Зависимости:** INFRA-01, INFRA-04, INFRA-05  
**Документы:** `08_Database_Schema.md`, `10_Dashboard_Implementation_Plan.md` (задача 3.1)  

**Что делаем:**
Дополнить `src/lib/dashboard-queries.ts`:
```
getTodayStats(supabase, date, employeeId?) → { fvToday, salesToday, revenueToday }
getLiveFeed(supabase, date, limit?) → Array<LiveFeedItem>
getTeamNow(supabase, date) → Array<TeamMemberStatus>
getTodaySchedule(supabase, date) → Array<ScheduleItem>
```

**Затронута БД:** ✅ `consultations`, `attendance`, `employees`  
**Затронут UI:** ❌  
**Затронута бизнес-логика:** ✅

**Критерии готовности:**
- [ ] `getLiveFeed` отсортирован по времени DESC
- [ ] `getTeamNow` показывает attendance статус
- [ ] При пустой БД — пустые массивы (не null)

---

### DASH-07 · Dashboard: Today Cards + Live Feed
**Модуль:** DASH  
**Приоритет:** P0  
**Оценка:** 2ч  
**Зависимости:** DASH-06, INFRA-06  
**Документы:** `06_UI_Design_System.md`, `10_Dashboard_Implementation_Plan.md` (3.2, 3.3)  

**Что делаем:**
Создать:
- `src/components/dashboard/TodayCards.tsx` — 2 карточки (ФВ сегодня / Продажи сегодня)
- `src/components/dashboard/LiveFeed.tsx` — лента событий сегодня с цветными индикаторами

**Затронута БД:** ✅  
**Затронут UI:** ✅  
**Затронута бизнес-логика:** ❌

**Критерии готовности:**
- [ ] Лента сортирована по времени (ближайшие сверху)
- [ ] Цвета статусов из Design System
- [ ] EmptyState при отсутствии записей
- [ ] Прокрутка внутри ленты при >10 записях

---

### DASH-08 · Dashboard: Team Now + Today Schedule
**Модуль:** DASH  
**Приоритет:** P1  
**Оценка:** 2ч  
**Зависимости:** DASH-06, INFRA-06  
**Документы:** `10_Dashboard_Implementation_Plan.md` (3.4, 3.5)  

**Что делаем:**
Создать:
- `src/components/dashboard/TeamNow.tsx` — список сотрудников с их статусом присутствия
- `src/components/dashboard/TodaySchedule.tsx` — расписание на сегодня с разделителем "сейчас"

**Затронута БД:** ✅ `attendance`, `employees`, `consultations`  
**Затронут UI:** ✅  
**Затронута бизнес-логика:** ❌

**Критерии готовности:**
- [ ] Статус присутствия: зелёная/серая/жёлтая точка
- [ ] "Сейчас" разделитель в правильном месте
- [ ] Прошедшие записи в расписании — `opacity-50`

---

### DASH-09 · Dashboard: Right Panel (сборка)
**Модуль:** DASH  
**Приоритет:** P0  
**Оценка:** 1ч  
**Зависимости:** DASH-07, DASH-08  
**Документы:** `10_Dashboard_Implementation_Plan.md` (задача 3.6)  

**Что делаем:**
Создать `src/components/dashboard/RightPanel.tsx` (Server Component):
- Загружает данные за сегодня
- Компонует: заголовок + TodayCards + LiveFeed + TeamNow + TodaySchedule
- `<Suspense fallback={<RightPanelSkeleton />}>`

Обновить `src/app/dashboard/page.tsx` — подключить обе панели.

**Затронута БД:** ✅  
**Затронут UI:** ✅  
**Затронута бизнес-логика:** ❌

**Критерии готовности:**
- [ ] Dashboard полностью собран (Left + Right)
- [ ] Suspense работает
- [ ] Данные актуальны при каждом открытии страницы

---

### DASH-10 · Dashboard: Realtime для Live Feed
**Модуль:** DASH  
**Приоритет:** P1  
**Оценка:** 1.5ч  
**Зависимости:** DASH-07  
**Документы:** `08_Database_Schema.md` (Realtime), `09_Development_Rules.md`  

**Что делаем:**
Добавить Supabase Realtime в `LiveFeed.tsx`:
- Подписка на `consultations` INSERT/UPDATE за сегодня
- Анимация появления новой записи (fade + slide down, 200ms)
- Cleanup: отписка в `useEffect` return

**Затронута БД:** ✅ Realtime channel  
**Затронут UI:** ✅  
**Затронута бизнес-логика:** ❌

**Критерии готовности:**
- [ ] Новая запись появляется без перезагрузки
- [ ] Анимация плавная
- [ ] Channel отписывается при unmount
- [ ] Нет дублирования при reconnect

---

### DASH-11 · Dashboard: ролевая фильтрация
**Модуль:** DASH  
**Приоритет:** P0  
**Оценка:** 2ч  
**Зависимости:** DASH-05, DASH-09  
**Документы:** `07_Pages_Specification.md` (матрица доступа Dashboard)  

**Что делаем:**
Убедиться что каждый блок Dashboard показывает правильные данные по роли:
- Owner: вся компания
- РОП: свой отдел
- МП/LMAI: только своё
- Бухгалтер: redirect на /dashboard/finances

**Затронута БД:** ✅  
**Затронут UI:** ✅  
**Затронута бизнес-логика:** ✅

**Критерии готовности:**
- [ ] МП видит только свои данные
- [ ] РОП видит данные своего отдела
- [ ] Owner видит все
- [ ] Бухгалтер → redirect
- [ ] Нет SQL ошибок при любой роли

---

### DASH-12 · Dashboard: Loading / Empty / Error состояния
**Модуль:** DASH  
**Приоритет:** P1  
**Оценка:** 2ч  
**Зависимости:** DASH-05, DASH-09  
**Документы:** `06_UI_Design_System.md` (Skeleton, Empty States, Error States)  

**Что делаем:**
Создать:
- `src/components/common/BlockError.tsx` — ошибка блока с "Попробовать снова"
- `src/components/common/DashboardErrorBoundary.tsx` — Error Boundary для блоков

Проверить все три состояния каждого блока Dashboard: loading → skeleton, empty → EmptyState, error → BlockError.

**Затронута БД:** ❌  
**Затронут UI:** ✅  
**Затронута бизнес-логика:** ❌

**Критерии готовности:**
- [ ] Каждый блок: 3 состояния
- [ ] Error boundary ловит ошибки рендера
- [ ] "Попробовать снова" выполняет refetch
- [ ] При сетевой ошибке: понятное сообщение на русском

---

### DASH-13 · Dashboard: финальный UI Polish
**Модуль:** DASH  
**Приоритет:** P1  
**Оценка:** 1.5ч  
**Зависимости:** DASH-12  
**Документы:** `06_UI_Design_System.md` (15-point checklist)  

**Что делаем:**
Финальная проверка Dashboard на соответствие Design System.
Нет фиолетовых элементов. Все числа tabular-nums. Правильные shadows. Hover анимации.

**Затронута БД:** ❌  
**Затронут UI:** ✅  
**Затронута бизнес-логика:** ❌

**Критерии готовности:**
- [ ] Нет `#8b5cf6` или `violet-*` классов
- [ ] Sidebar `#0c1f33`
- [ ] Все числа tabular-nums
- [ ] `tsc --noEmit` без ошибок
- [ ] `next lint` без ошибок
- [ ] Визуально совпадает с утверждённым Premium Split Focus дизайном

---

## Раздел 4: CONS — Консультации

---

### CONS-01 · Страница: список консультаций
**Модуль:** CONS  
**Приоритет:** P0  
**Оценка:** 3ч  
**Зависимости:** CORE-01, CORE-02, INFRA-05, INFRA-06  
**Документы:** `07_Pages_Specification.md` (модуль 5), `06_UI_Design_System.md` (таблицы)  

**Что делаем:**
Переработать `src/app/dashboard/consultations/page.tsx`:
- Таблица консультаций с сортировкой по дате
- Фильтры: дата, менеджер, статус
- Кнопка "Новая запись" → открывает Modal
- Ролевая фильтрация данных

**Затронута БД:** ✅ `consultations`, `employees`  
**Затронут UI:** ✅  
**Затронута бизнес-логика:** ❌

**Критерии готовности:**
- [ ] Таблица отображает consultations
- [ ] Фильтры работают
- [ ] Пагинация (50 записей на страницу)
- [ ] Ролевая фильтрация: МП видит только свои
- [ ] Loading skeleton, EmptyState

---

### CONS-02 · Modal: создание/редактирование консультации
**Модуль:** CONS  
**Приоритет:** P0  
**Оценка:** 3ч  
**Зависимости:** CONS-01, INFRA-05  
**Документы:** `07_Pages_Specification.md` (модуль 5), `06_UI_Design_System.md` (Модальные окна)  

**Что делаем:**
Обновить `src/components/ConsultationModal.tsx`:
- Поля по схеме из 08: date, time, client_name, phone, deal_number, format, manager_id, status, actual_status, status_after_fv, amount, delivery_cost, is_nv, comment
- При `status_after_fv = 'Отказ'` → обязательный красный блок comment
- Валидация через Zod
- Server Action для сохранения

**Затронута БД:** ✅ `consultations`  
**Затронут UI:** ✅  
**Затронута бизнес-логика:** ✅ (триггер продажи)

**Критерии готовности:**
- [ ] Все поля из схемы присутствуют
- [ ] Статусы правильные: Придёт/Не придёт/... и Пришла/Не пришла и Купила/...
- [ ] При Отказ — comment обязателен
- [ ] Телефон форматируется +996 XXX XXX-XX-XX
- [ ] Deal number: только цифры, max 7, с # префиксом
- [ ] createPortal — Modal поверх sidebar
- [ ] После сохранения → Toast success + обновление списка

---

### CONS-03 · Server Action: consultations CRUD
**Модуль:** CONS  
**Приоритет:** P0  
**Оценка:** 2ч  
**Зависимости:** INFRA-04, INFRA-05  
**Документы:** `09_Development_Rules.md` (Server Actions), `08_Database_Schema.md`  

**Что делаем:**
Создать `src/actions/consultations.ts`:
- `createConsultation(data)` → INSERT
- `updateConsultation(id, data)` → UPDATE
- `deleteConsultation(id)` → soft delete (deleted_at = NOW())
- Каждый action: проверка auth, Zod валидация, revalidatePath

**Затронута БД:** ✅  
**Затронут UI:** ❌  
**Затронута бизнес-логика:** ✅

**Критерии готовности:**
- [ ] Все 3 действия работают
- [ ] Auth проверяется в каждом action
- [ ] Zod валидация на все поля
- [ ] После мутации: revalidatePath('/dashboard/consultations')
- [ ] Ошибки Supabase обрабатываются, не падают на клиент

---

## Раздел 5: DECOMP — Декомпозиция

---

### DECOMP-01 · Страница: декомпозиция сотрудника
**Модуль:** DECOMP  
**Приоритет:** P0  
**Оценка:** 4ч  
**Зависимости:** CORE-01, INFRA-05, INFRA-06  
**Документы:** `07_Pages_Specification.md` (модуль 4)  

**Что делаем:**
Переработать `src/app/dashboard/decomposition/` и `[id]/`:
- Список сотрудников с их KPI% за текущий месяц (для РОП/Owner)
- Страница сотрудника: таблица план/факт по дням месяца + инлайн редактирование факта
- Отображение ФВ, Продаж, Выручки, НВ, Обращений, Лидов
- Цветные индикаторы прогресса

**Затронута БД:** ✅ `decomposition`, `daily_facts`, `employee_kpi`, `consultations`  
**Затронут UI:** ✅  
**Затронута бизнес-логика:** ✅

**Критерии готовности:**
- [ ] Таблица отображает данные по дням
- [ ] Инлайн редактирование факта работает
- [ ] Данные обновляются без перезагрузки страницы
- [ ] Ролевая фильтрация: МП видит только себя
- [ ] Скроллируется по горизонтали при большом числе дней

---

### DECOMP-02 · Modal: редактирование плана KPI
**Модуль:** DECOMP  
**Приоритет:** P1  
**Оценка:** 2ч  
**Зависимости:** DECOMP-01  
**Документы:** `07_Pages_Specification.md` (4.3 Modal Плана)  

**Что делаем:**
Создать Modal для редактирования/установки плана KPI на месяц:
- Поля: plan_fv, plan_sales, plan_revenue, plan_work_days, notes
- Доступно: owner, rop
- Валидация через Zod

**Затронута БД:** ✅ `employee_kpi`  
**Затронут UI:** ✅  
**Затронута бизнес-логика:** ✅

**Критерии готовности:**
- [ ] Modal открывается через кнопку "Изменить план"
- [ ] Только owner/rop видят кнопку
- [ ] После сохранения → пересчёт decomposition

---

### DECOMP-03 · Server Action: daily_facts CRUD
**Модуль:** DECOMP  
**Приоритет:** P0  
**Оценка:** 1.5ч  
**Зависимости:** INFRA-04, INFRA-05  
**Документы:** `09_Development_Rules.md`, `08_Database_Schema.md`  

**Что делаем:**
Создать `src/actions/decomposition.ts`:
- `upsertDailyFact(employeeId, date, data)` → UPSERT daily_facts
- `upsertKpiPlan(data)` → UPSERT employee_kpi
- После мутации: revalidatePath

**Затронута БД:** ✅ `daily_facts`, `employee_kpi`  
**Затронут UI:** ❌  
**Затронута бизнес-логика:** ✅ (триггер пересчёта)

**Критерии готовности:**
- [ ] UPSERT работает корректно (не дублирует)
- [ ] Триггер `trg_daily_facts_recalc_decomposition` запускается
- [ ] Ошибки обрабатываются

---

## Раздел 6: EMP — Сотрудники

---

### EMP-01 · Страница: список сотрудников
**Модуль:** EMP  
**Приоритет:** P1  
**Оценка:** 3ч  
**Зависимости:** CORE-01, INFRA-05, INFRA-06  
**Документы:** `07_Pages_Specification.md` (модуль 6)  

**Что делаем:**
Переработать `src/app/dashboard/employees/page.tsx`:
- Карточки/таблица сотрудников
- Фильтр по роли, статусу
- Кнопка "Добавить сотрудника" (owner only)

**Затронута БД:** ✅ `employees`  
**Затронут UI:** ✅  
**Затронута бизнес-логика:** ❌

**Критерии готовности:**
- [ ] Список сотрудников с аватарами (инициалы)
- [ ] Кнопка добавления только для owner
- [ ] Фильтрация работает
- [ ] EmptyState

---

### EMP-02 · Modal: создание/редактирование сотрудника
**Модуль:** EMP  
**Приоритет:** P1  
**Оценка:** 3ч  
**Зависимости:** EMP-01  
**Документы:** `07_Pages_Specification.md` (6.2), `08_Database_Schema.md` (employees)  

**Что делаем:**
Создать Modal сотрудника:
- Поля: name, email, phone, role, department_id, hire_date, base_salary, kpi_coefficient, schedule_type
- При создании → GoTrue Admin API создаёт auth.users запись
- При role = 'archived' → деактивация в Auth

**Затронута БД:** ✅ `employees`  
**Затронут UI:** ✅  
**Затронута бизнес-логика:** ✅ (GoTrue Admin API)

**Критерии готовности:**
- [ ] После создания → пользователь может войти
- [ ] email уникален (ошибка если занят)
- [ ] Архивирование отключает вход

---

### EMP-03 · Server Action: employees CRUD
**Модуль:** EMP  
**Приоритет:** P1  
**Оценка:** 2ч  
**Зависимости:** INFRA-04, INFRA-05  
**Документы:** `09_Development_Rules.md`  

**Что делаем:**
Создать `src/actions/employees.ts`:
- `createEmployee(data)` → INSERT + GoTrue Admin API
- `updateEmployee(id, data)` → UPDATE
- `archiveEmployee(id)` → soft delete + Auth deactivate

**Затронута БД:** ✅ `employees`, auth.users  
**Затронут UI:** ❌  
**Затронута бизнес-логика:** ✅

**Критерии готовности:**
- [ ] Admin Client (service role) используется для Auth
- [ ] Zod валидация
- [ ] Архивирование работает

---

## Раздел 7: FIN — Финансы

---

### FIN-01 · Страница: Финансы (обзор)
**Модуль:** FIN  
**Приоритет:** P1  
**Оценка:** 3ч  
**Зависимости:** CORE-01, INFRA-05, INFRA-06  
**Документы:** `07_Pages_Specification.md` (модуль 2)  

**Что делаем:**
Переработать `src/app/dashboard/finance/page.tsx`:
- Карточки: Доходы / Расходы / Прибыль за месяц
- График динамики по месяцам (Area chart)
- Таблица транзакций с фильтрами
- Доступно: owner, accountant

**Затронута БД:** ✅ `finances`, `finance_transactions`, `finance_categories`  
**Затронут UI:** ✅  
**Затронута бизнес-логика:** ❌

**Критерии готовности:**
- [ ] Карточки показывают корректные суммы
- [ ] Таблица транзакций с пагинацией
- [ ] Фильтр по типу (доход/расход) и категории
- [ ] Только owner/accountant видят страницу

---

### FIN-02 · Modal: добавление транзакции
**Модуль:** FIN  
**Приоритет:** P1  
**Оценка:** 2ч  
**Зависимости:** FIN-01  
**Документы:** `07_Pages_Specification.md` (2.2)  

**Что делаем:**
Создать Modal добавления транзакции:
- Поля: type, category_id, amount, date, description
- Zod валидация

**Затронута БД:** ✅ `finance_transactions`  
**Затронут UI:** ✅  
**Затронута бизнес-логика:** ✅ (триггер finances)

**Критерии готовности:**
- [ ] После сохранения finances пересчитывается (триггер)
- [ ] Toast success
- [ ] amount > 0 проверяется

---

### FIN-03 · Server Action: finance_transactions CRUD
**Модуль:** FIN  
**Приоритет:** P1  
**Оценка:** 1.5ч  
**Зависимости:** INFRA-04, INFRA-05  
**Документы:** `09_Development_Rules.md`  

**Что делаем:**
Создать `src/actions/finances.ts`:
- `createTransaction(data)`
- `updateTransaction(id, data)`
- `deleteTransaction(id)` → soft delete

**Затронута БД:** ✅  
**Затронут UI:** ❌  
**Затронута бизнес-логика:** ✅

**Критерии готовности:**
- [ ] Auth: только owner/accountant
- [ ] Zod валидация
- [ ] После мутации finances пересчитывается

---

## Раздел 8: SAL — Зарплаты

---

### SAL-01 · Страница: список зарплат
**Модуль:** SAL  
**Приоритет:** P1  
**Оценка:** 3ч  
**Зависимости:** CORE-01, INFRA-05, INFRA-06  
**Документы:** `07_Pages_Specification.md` (модуль 3)  

**Что делаем:**
Переработать `src/app/dashboard/salary/page.tsx`:
- Таблица: сотрудник, период, KPI%, базовый оклад, бонус, итого, статус
- Фильтр по периоду (месяц/год)
- Кнопка "Рассчитать" (запуск `calculate_salary`)
- Кнопка "Выплатить" → меняет статус на 'paid'

**Затронута БД:** ✅ `salaries`, `employees`, `decomposition`  
**Затронут UI:** ✅  
**Затронута бизнес-логика:** ✅

**Критерии готовности:**
- [ ] Таблица отображает salaries
- [ ] Расчёт запускается через Server Action
- [ ] Выплата создаёт finance_transaction (через триггер)
- [ ] Ролевая фильтрация

---

### SAL-02 · Страница: расчётный лист сотрудника
**Модуль:** SAL  
**Приоритет:** P2  
**Оценка:** 2ч  
**Зависимости:** SAL-01  
**Документы:** `07_Pages_Specification.md` (3.2)  

**Что делаем:**
Создать `src/app/dashboard/salary/[id]/page.tsx`:
- Детали расчёта из `salary_calculations`
- Построчно: оклад, корректировка, KPI бонус
- Кнопка "Скачать расчётный лист" (PDF — будущее)

**Затронута БД:** ✅ `salary_calculations`  
**Затронут UI:** ✅  
**Затронута бизнес-логика:** ❌

---

### SAL-03 · Server Action: расчёт и выплата зарплаты
**Модуль:** SAL  
**Приоритет:** P1  
**Оценка:** 1.5ч  
**Зависимости:** INFRA-04, INFRA-05  
**Документы:** `09_Development_Rules.md`  

**Что делаем:**
Создать `src/actions/salaries.ts`:
- `calculateSalary(employeeId, year, month)` → вызов `calculate_salary()` PG функции
- `paySalary(salaryId)` → UPDATE status = 'paid', paid_at = NOW()

**Затронута БД:** ✅  
**Затронут UI:** ❌  
**Затронута бизнес-логика:** ✅

---

## Раздел 9: CAL — Рабочий календарь

---

### CAL-01 · Страница: рабочий календарь
**Модуль:** CAL  
**Приоритет:** P2  
**Оценка:** 4ч  
**Зависимости:** CORE-01, INFRA-05  
**Документы:** `07_Pages_Specification.md` (модуль 7)  

**Что делаем:**
Создать/обновить страницу календаря:
- Сетка месяца с метками рабочий/выходной
- Отметка явки: кликнуть на день → выбрать статус
- Цвета по attendance.status
- Генерация расписания на месяц (вызов `generate_monthly_schedule`)

**Затронута БД:** ✅ `schedules`, `attendance`  
**Затронут UI:** ✅  
**Затронута бизнес-логика:** ✅

**Критерии готовности:**
- [ ] Сетка месяца отображается
- [ ] Клик на день → изменение статуса
- [ ] Цвета статусов из Design System
- [ ] Расписание генерируется для нового месяца

---

## Раздел 10: NOTIF — Уведомления

---

### NOTIF-01 · Страница: список уведомлений
**Модуль:** NOTIF  
**Приоритет:** P2  
**Оценка:** 2ч  
**Зависимости:** CORE-02, INFRA-05  
**Документы:** `07_Pages_Specification.md` (модуль 9)  

**Что делаем:**
Создать `src/app/dashboard/notifications/page.tsx`:
- Список уведомлений (своих)
- Отметка как прочитанное
- Фильтр по типу (важные/все)

**Затронута БД:** ✅ `notifications`  
**Затронут UI:** ✅  
**Затронута бизнес-логика:** ❌

---

### NOTIF-02 · Realtime уведомления в Topbar
**Модуль:** NOTIF  
**Приоритет:** P2  
**Оценка:** 1.5ч  
**Зависимости:** CORE-02, NOTIF-01  
**Документы:** `08_Database_Schema.md` (Realtime)  

**Что делаем:**
Обновить `Topbar.tsx`:
- Realtime подписка на `notifications` INSERT
- Badge обновляется при новом уведомлении
- Dropdown с последними 5 уведомлениями

**Затронута БД:** ✅ Realtime channel  
**Затронут UI:** ✅  
**Затронута бизнес-логика:** ❌

---

## Раздел 11: SET — Настройки

---

### SET-01 · Настройки: Компания
**Модуль:** SET  
**Приоритет:** P2  
**Оценка:** 2ч  
**Зависимости:** CORE-01, INFRA-05  
**Документы:** `07_Pages_Specification.md` (модуль 10)  

**Что делаем:**
Создать страницу настроек компании:
- Название, логотип, timezone, валюта
- Дни выплаты, дни закрытия периода

**Затронута БД:** ✅ `settings`  
**Затронут UI:** ✅  
**Затронута бизнес-логика:** ❌

---

### SET-02 · Настройки: KPI шаблоны
**Модуль:** SET  
**Приоритет:** P2  
**Оценка:** 2ч  
**Зависимости:** SET-01  
**Документы:** `07_Pages_Specification.md` (10.2)  

**Что делаем:**
CRUD для `kpi_templates`:
- Редактирование весов метрик
- Установка порогов бонуса

**Затронута БД:** ✅ `kpi_templates`  
**Затронут UI:** ✅  
**Затронута бизнес-логика:** ✅

---

### SET-03 · Настройки: Безопасность
**Модуль:** SET  
**Приоритет:** P2  
**Оценка:** 1.5ч  
**Зависимости:** SET-01  
**Документы:** `07_Pages_Specification.md` (10.5)  

**Что делаем:**
- Смена пароля
- История входов (из audit_logs)

**Затронута БД:** ✅ `audit_logs`  
**Затронут UI:** ✅  
**Затронута бизнес-логика:** ❌

---

## Раздел 12: DOC — Документы

---

### DOC-01 · Страница: документы
**Модуль:** DOC  
**Приоритет:** P3  
**Оценка:** 3ч  
**Зависимости:** CORE-01, INFRA-05, INFRA-01 (Storage)  
**Документы:** `07_Pages_Specification.md` (модуль 8)  

**Что делаем:**
Создать страницу документов:
- Список с категориями
- Загрузка в Supabase Storage (bucket: documents)
- Скачивание/просмотр

**Затронута БД:** ✅ `documents`, Storage  
**Затронут UI:** ✅  
**Затронута бизнес-логика:** ❌

---

## Раздел 13: INT — Интеграции

---

### INT-01 · Страница: интеграции
**Модуль:** INT  
**Приоритет:** P3  
**Оценка:** 2ч  
**Зависимости:** SET-01  
**Документы:** `07_Pages_Specification.md` (модуль 11)  

**Что делаем:**
Создать страницу интеграций:
- Список доступных интеграций (amoCRM, Telegram, Google Sheets)
- Статус подключения
- Кнопка "Подключить" (заглушка для MVP)

**Затронута БД:** ✅ `integrations`  
**Затронут UI:** ✅  
**Затронута бизнес-логика:** ❌

---

### INT-02 · Telegram Bot (базовый)
**Модуль:** INT  
**Приоритет:** P3  
**Оценка:** 8ч  
**Зависимости:** INT-01  
**Документы:** `07_Pages_Specification.md` (11.4)  

**Что делаем:**
Реализовать базовый Telegram Bot:
- Webhook endpoint (`/api/webhooks/telegram`)
- Ежедневный отчёт по записям
- Алерт при новой продаже

**Затронута БД:** ✅ `integrations`, `consultations`  
**Затронут UI:** ❌  
**Затронута бизнес-логика:** ✅

---

---

# Sprint Planning

---

## Sprint 0 — Инфраструктура и среда
**Цель:** Рабочая база данных, настроенная среда, приложение запускается.  
**Ориентировочное время:** 2–3 дня

| ID | Задача | Часы |
|----|--------|------|
| INFRA-01 | Применение миграций в Supabase | 1ч |
| INFRA-02 | Создание первого пользователя (Владелец) | 0.5ч |
| INFRA-03 | Настройка переменных окружения | 0.5ч |
| INFRA-04 | Обновление Supabase клиентов | 1ч |
| INFRA-05 | Обновление TypeScript типов | 2ч |
| INFRA-06 | Утилиты: форматтеры и константы | 1ч |
| CORE-04 | AuthContext обновление | 1.5ч |
| CORE-05 | Middleware — защита маршрутов | 1ч |

**Итого:** ~8.5 часов  

**Ожидаемый результат:**
- Все 24 таблицы созданы и заполнены seed данными
- Вход в систему работает
- `get_my_role()` возвращает 'owner'
- Приложение запускается без ошибок
- TypeScript компилируется

**Definition of Done Sprint 0:**
- [ ] `SELECT COUNT(*) FROM employees` → 1 (владелец)
- [ ] Вход через /auth/login работает
- [ ] `next dev` без ошибок
- [ ] `tsc --noEmit` без ошибок
- [ ] RLS проверен: анонимный запрос возвращает 0 строк

---

## Sprint 1 — Layout и основная навигация
**Цель:** Профессиональный интерфейс с правильным дизайном, без старого фиолетового.  
**Ориентировочное время:** 2–3 дня

| ID | Задача | Часы |
|----|--------|------|
| CORE-01 | Редизайн Sidebar | 2ч |
| CORE-02 | Topbar | 2ч |
| CORE-03 | Dashboard Layout структура (Split Focus) | 1ч |

**Итого:** ~5 часов  

**Ожидаемый результат:**
- Sidebar: `#0c1f33`, ширина 192px, без фиолетового
- Topbar: 52px, blur, дата, уведомления
- Dashboard: двухпанельный layout (Left/Right)
- Существующие страницы (consultations, decomposition, employees) не сломаны

**Definition of Done Sprint 1:**
- [ ] Нет `#8b5cf6` / `violet-*` в коде
- [ ] Sidebar width: 192px
- [ ] Topbar height: 52px, sticky
- [ ] Двухпанельный layout работает на ≥ 1280px
- [ ] На < 1280px: панели стекируются вертикально

---

## Sprint 2 — Dashboard: Левая панель (данные за месяц)
**Цель:** Полностью функциональная левая панель Dashboard с реальными данными.  
**Ориентировочное время:** 3–4 дня

| ID | Задача | Часы |
|----|--------|------|
| DASH-01 | Dashboard: запросы данных за месяц | 2ч |
| DASH-02 | KPI карточки месяца | 2ч |
| DASH-03 | Revenue by Weeks chart | 1.5ч |
| DASH-04 | Plan vs Fact таблица | 2ч |
| DASH-05 | Left Panel сборка | 1ч |

**Итого:** ~8.5 часов  

**Ожидаемый результат:**
- Левая панель: 4 KPI карточки + chart + таблица
- Данные приходят из Supabase
- Skeleton при загрузке
- Ролевая фильтрация работает

**Definition of Done Sprint 2:**
- [ ] При пустой БД: карточки показывают 0, не падают
- [ ] При заполненной БД: реальные данные
- [ ] Skeleton виден ≈ 200ms (если быстрый интернет)
- [ ] Числа tabular-nums
- [ ] Chart рендерится без ошибок

---

## Sprint 3 — Dashboard: Правая панель + Realtime
**Цель:** Полностью функциональная правая панель с live обновлениями.  
**Ориентировочное время:** 3–4 дня

| ID | Задача | Часы |
|----|--------|------|
| DASH-06 | Dashboard: запросы данных за сегодня | 1.5ч |
| DASH-07 | Today Cards + Live Feed | 2ч |
| DASH-08 | Team Now + Today Schedule | 2ч |
| DASH-09 | Right Panel сборка | 1ч |
| DASH-10 | Realtime для Live Feed | 1.5ч |
| DASH-11 | Ролевая фильтрация Dashboard | 2ч |
| DASH-12 | Loading / Empty / Error состояния | 2ч |
| DASH-13 | Финальный UI Polish | 1.5ч |

**Итого:** ~13.5 часов  

**Ожидаемый результат:**
- Dashboard полностью завершён
- Realtime: новые записи появляются без перезагрузки
- Все роли видят правильные данные
- Все 3 состояния: loading/empty/error
- Визуально совпадает с утверждённым дизайном

**Definition of Done Sprint 3:**
- [ ] Dashboard Definition of Done из docs/10 — все 15 пунктов
- [ ] Realtime: новая консультация появляется без F5
- [ ] МП: видит только свои данные
- [ ] Owner: видит данные компании
- [ ] `next lint` без ошибок

---

## Sprint 4 — Консультации (полный модуль)
**Цель:** Полностью функциональный модуль записей на консультацию.  
**Ориентировочное время:** 3–4 дня

| ID | Задача | Часы |
|----|--------|------|
| CONS-01 | Страница: список консультаций | 3ч |
| CONS-02 | Modal: создание/редактирование | 3ч |
| CONS-03 | Server Action: consultations CRUD | 2ч |

**Итого:** ~8 часов  

**Ожидаемый результат:**
- Таблица консультаций с фильтрами
- Modal создания/редактирования работает
- CRUD операции через Server Actions
- Триггер: при продаже → автоматическая finance_transaction

**Definition of Done Sprint 4:**
- [ ] Создать запись → появляется в таблице
- [ ] Изменить статус на "Купила" → создаётся транзакция в finances
- [ ] Удалить → soft delete (запись не пропадает из audit_logs)
- [ ] Все статусы правильные (по схеме 08)
- [ ] Ролевая фильтрация: МП видит только свои

---

## Sprint 5 — Сотрудники (полный модуль) ✅
**Цель:** CRUD сотрудников с мягким удалением и восстановлением.  
**Статус:** Завершён

| ID | Задача | Статус |
|----|--------|--------|
| EMP-01 | Страница: список сотрудников | ✅ |
| EMP-02 | Modal: создание/редактирование | ✅ |
| EMP-03 | Server Action: employees CRUD | ✅ |

---

## Sprint 6 — Декомпозиция (полный модуль)
**Цель:** Планирование по уровням (компания → сотрудник → месяц → неделя → день), факт, выполнение, ежедневная отчётность, автоматические расчёты, цветовые индикаторы, основа KPI.  
**Ориентировочное время:** 4–5 дней

| ID | Задача | Часы |
|----|--------|------|
| DECOMP-01 | План компании и сотрудников (месяц) | 3ч |
| DECOMP-02 | Таблица план/факт по дням (неделя/день) | 4ч |
| DECOMP-03 | Инлайн ввод факта + ежедневная отчётность | 3ч |
| DECOMP-04 | Цветовые индикаторы выполнения | 1ч |
| DECOMP-05 | Автоматические расчёты (триггеры) | 1.5ч |
| DECOMP-06 | Modal редактирования плана KPI | 2ч |
| DECOMP-07 | Server Actions: daily_facts + employee_kpi | 2ч |

**Итого:** ~16.5 часов

**Ожидаемый результат:**
- Полный план компании и план каждого сотрудника на месяц
- Декомпозиция по неделям и дням
- Ввод факта по каждому дню
- Ежедневная отчётность с цветами прогресса
- Автоматический пересчёт через триггеры БД
- Цветовые индикаторы: зелёный / жёлтый / красный по % выполнения
- Основа для расчёта KPI (данные для зарплатного модуля)

**Definition of Done Sprint 6:**
- [ ] Страница план компании: ФВ, Продажи, Выручка на месяц
- [ ] Страница сотрудника: таблица по дням (план / факт / %)
- [ ] Инлайн редактирование факта работает без перезагрузки
- [ ] Цвет строки меняется по % выполнения
- [ ] Триггер пересчёта `decomposition` срабатывает автоматически
- [ ] Modal плана: только owner/rop могут изменять
- [ ] tsc 0 ошибок, eslint 0 ошибок, next build успешно

---

## Sprint 7 — Конструктор мотивации
**Цель:** Гибкая настройка системы мотивации без изменения кода.  
**Ориентировочное время:** 4–5 дней

| ID | Задача | Часы |
|----|--------|------|
| MOT-01 | Страница конструктора мотивации | 3ч |
| MOT-02 | Настройка окладов по ролям | 2ч |
| MOT-03 | Настройка бонусов и процентов | 3ч |
| MOT-04 | Настройка штрафов | 2ч |
| MOT-05 | Формулы расчёта (редактор правил) | 4ч |
| MOT-06 | Правила для каждой роли | 2ч |
| MOT-07 | Server Actions: CRUD правил мотивации | 2ч |

**Итого:** ~18 часов

**Ожидаемый результат:**
- Owner может настроить систему мотивации без программиста
- Оклад, бонус, процент, штраф — все настраиваются через UI
- Формулы сохраняются в БД и применяются при расчёте зарплаты
- Разные правила для owner / rop / mp / lmai / accountant

**Definition of Done Sprint 7:**
- [ ] Страница конструктора открывается, все правила видны
- [ ] Изменение оклада → сохраняется → применяется при расчёте
- [ ] Добавление бонусного правила работает
- [ ] Штраф уменьшает итоговую сумму
- [ ] Только owner видит и редактирует конструктор
- [ ] tsc 0 ошибок, eslint 0 ошибок, next build успешно

---

## Sprint 8 — Зарплата
**Цель:** Автоматический расчёт и история выплат на основе конструктора мотивации.  
**Ориентировочное время:** 4–5 дней

| ID | Задача | Часы |
|----|--------|------|
| SAL-01 | Страница: список зарплат | 3ч |
| SAL-02 | Автоматический расчёт на основе конструктора | 3ч |
| SAL-03 | Страница: расчётный лист сотрудника | 2ч |
| SAL-04 | Выплаты и история начислений | 2ч |
| SAL-05 | Расчёт по сотрудникам (детали) | 2ч |
| SAL-06 | Экспорт (CSV / PDF) | 2ч |
| SAL-07 | Server Actions: расчёт и выплата | 2ч |

**Итого:** ~16 часов

**Ожидаемый результат:**
- Автоматический расчёт зарплаты по формулам конструктора
- Детальный расчётный лист: оклад + бонус + штраф + итог
- История всех начислений и выплат
- Экспорт в CSV или PDF

**Definition of Done Sprint 8:**
- [ ] Кнопка «Рассчитать» запускает расчёт и сохраняет результат
- [ ] Расчёт использует правила из конструктора мотивации
- [ ] Расчётный лист показывает построчную детализацию
- [ ] Кнопка «Выплатить» меняет статус и создаёт транзакцию в финансах
- [ ] Экспорт скачивает файл
- [ ] tsc 0 ошибок, eslint 0 ошибок, next build успешно

---

## Sprint 9 — Финансы
**Цель:** Полный финансовый учёт: доходы, расходы, P&L, Cash Flow, прибыль.  
**Ориентировочное время:** 5–6 дней

| ID | Задача | Часы |
|----|--------|------|
| FIN-01 | Страница: Финансы (обзор) | 3ч |
| FIN-02 | Доходы и расходы с категориями | 3ч |
| FIN-03 | P&L отчёт | 3ч |
| FIN-04 | Cash Flow | 3ч |
| FIN-05 | Валовая и чистая прибыль | 2ч |
| FIN-06 | Учёт зарплат и выплат инвесторам | 2ч |
| FIN-07 | Финансовые отчёты (экспорт) | 2ч |
| FIN-08 | Modal: добавление транзакции | 2ч |
| FIN-09 | Server Actions: finance_transactions CRUD | 1.5ч |

**Итого:** ~21.5 часов

**Ожидаемый результат:**
- Полный учёт доходов и расходов по категориям и подкатегориям
- P&L и Cash Flow отчёты за любой период
- Расчёт валовой и чистой прибыли
- Зарплаты из Sprint 8 автоматически попадают в расходы
- Финансовые отчёты для owner / accountant

**Definition of Done Sprint 9:**
- [ ] Транзакции добавляются по категориям и подкатегориям
- [ ] P&L показывает корректные итоги за период
- [ ] Cash Flow показывает движение денег по дням/неделям/месяцам
- [ ] Выплата зарплаты (Sprint 8) создаёт expense транзакцию
- [ ] Только owner/accountant видят финансовый модуль
- [ ] tsc 0 ошибок, eslint 0 ошибок, next build успешно

---

## Sprint 10 — Товароучёт
**Цель:** Управление товарами, остатками, закупками и себестоимостью.  
**Ориентировочное время:** 5–6 дней

| ID | Задача | Часы |
|----|--------|------|
| INV-01 | Каталог товаров | 3ч |
| INV-02 | Остатки на складе | 3ч |
| INV-03 | Закупки и поставщики | 3ч |
| INV-04 | Себестоимость товаров | 2ч |
| INV-05 | Приход и списание | 3ч |
| INV-06 | Инвентаризация | 2ч |
| INV-07 | История движения товаров | 2ч |
| INV-08 | Аналитика товаров | 3ч |
| INV-09 | Server Actions: CRUD товаров | 2ч |

**Итого:** ~23 часа

**Ожидаемый результат:**
- Полный каталог товаров с ценами и себестоимостью
- Учёт остатков в реальном времени
- Приход от поставщиков, списание
- Инвентаризация с фиксацией расхождений
- Аналитика: оборот, рентабельность, ТОП продаж

**Definition of Done Sprint 10:**
- [ ] Товары добавляются в каталог
- [ ] Приход увеличивает остаток, продажа/списание уменьшает
- [ ] Инвентаризация фиксирует факт и расхождение
- [ ] Аналитика показывает оборот по товарам
- [ ] tsc 0 ошибок, eslint 0 ошибок, next build успешно

---

## Sprint 11 — Аналитика и AI
**Цель:** Сводная аналитика бизнеса и AI-помощник руководителя.  
**Ориентировочное время:** 5–7 дней

| ID | Задача | Часы |
|----|--------|------|
| AI-01 | Главная аналитика (сводный дашборд) | 4ч |
| AI-02 | AI-помощник руководителя (Claude API) | 6ч |
| AI-03 | Анализ KPI по сотрудникам | 3ч |
| AI-04 | Анализ финансовых показателей | 3ч |
| AI-05 | Анализ эффективности сотрудников | 3ч |
| AI-06 | AI-рекомендации по бизнесу | 4ч |
| AI-07 | Прогнозирование (тренды) | 4ч |

**Итого:** ~27 часов

**Ожидаемый результат:**
- Единая аналитическая страница с ключевыми метриками бизнеса
- AI-чат для руководителя: вопросы о KPI, финансах, сотрудниках
- Прогноз выручки и KPI на следующий месяц
- Автоматические рекомендации на основе данных

**Definition of Done Sprint 11:**
- [ ] Аналитическая страница показывает данные всех модулей
- [ ] AI-помощник отвечает на вопросы о бизнес-показателях
- [ ] Прогноз строится на основе исторических данных
- [ ] Рекомендации основаны на реальных данных системы
- [ ] tsc 0 ошибок, eslint 0 ошибок, next build успешно

---

## Общая карта Sprints

| Sprint | Название | Статус | Часов | Недель |
|--------|----------|--------|-------|--------|
| 0 | Инфраструктура | ✅ | 8.5 | 1 |
| 1 | Layout и навигация | ✅ | 5 | 0.5 |
| 2 | Dashboard Left Panel | ✅ | 8.5 | 1 |
| 3 | Dashboard Right Panel + Realtime | ✅ | 13.5 | 1.5 |
| 4 | Консультации | ✅ | 8 | 1 |
| 5 | Сотрудники | ✅ | 8 | 1 |
| 6 | Декомпозиция | ⏳ | 16.5 | 2 |
| 7 | Конструктор мотивации | ⏳ | 18 | 2 |
| 8 | Зарплата | ⏳ | 16 | 2 |
| 9 | Финансы | ⏳ | 21.5 | 2.5 |
| 10 | Товароучёт | ⏳ | 23 | 2.5 |
| 11 | Аналитика и AI | ⏳ | 27 | 3 |
| **Итого** | | | **~174** | **~20 недель** |

---

## Backlog — Сводная таблица всех задач

| ID | Модуль | Название | Приоритет | Часы | Спринт |
|----|--------|----------|-----------|------|--------|
| INFRA-01 | INFRA | Применение миграций | P0 | 1 | S0 |
| INFRA-02 | INFRA | Первый пользователь | P0 | 0.5 | S0 |
| INFRA-03 | INFRA | Переменные окружения | P0 | 0.5 | S0 |
| INFRA-04 | INFRA | Supabase клиенты | P0 | 1 | S0 |
| INFRA-05 | INFRA | TypeScript типы | P0 | 2 | S0 |
| INFRA-06 | INFRA | Форматтеры и константы | P0 | 1 | S0 |
| CORE-01 | CORE | Редизайн Sidebar | P0 | 2 | S1 |
| CORE-02 | CORE | Topbar | P0 | 2 | S1 |
| CORE-03 | CORE | Dashboard Layout | P0 | 1 | S1 |
| CORE-04 | CORE | AuthContext | P0 | 1.5 | S0 |
| CORE-05 | CORE | Middleware | P0 | 1 | S0 |
| DASH-01 | DASH | Запросы за месяц | P0 | 2 | S2 |
| DASH-02 | DASH | KPI карточки | P0 | 2 | S2 |
| DASH-03 | DASH | Revenue chart | P1 | 1.5 | S2 |
| DASH-04 | DASH | Plan vs Fact таблица | P0 | 2 | S2 |
| DASH-05 | DASH | Left Panel | P0 | 1 | S2 |
| DASH-06 | DASH | Запросы за сегодня | P0 | 1.5 | S3 |
| DASH-07 | DASH | Today Cards + Live Feed | P0 | 2 | S3 |
| DASH-08 | DASH | Team Now + Schedule | P1 | 2 | S3 |
| DASH-09 | DASH | Right Panel | P0 | 1 | S3 |
| DASH-10 | DASH | Realtime Live Feed | P1 | 1.5 | S3 |
| DASH-11 | DASH | Ролевая фильтрация | P0 | 2 | S3 |
| DASH-12 | DASH | Loading/Empty/Error | P1 | 2 | S3 |
| DASH-13 | DASH | UI Polish | P1 | 1.5 | S3 |
| CONS-01 | CONS | Список консультаций | P0 | 3 | S4 |
| CONS-02 | CONS | Modal консультации | P0 | 3 | S4 |
| CONS-03 | CONS | Server Actions CRUD | P0 | 2 | S4 |
| DECOMP-01 | DECOMP | Декомпозиция | P0 | 4 | S5 |
| DECOMP-02 | DECOMP | Modal плана KPI | P1 | 2 | S5 |
| DECOMP-03 | DECOMP | Server Actions | P0 | 1.5 | S5 |
| EMP-01 | EMP | Список сотрудников | P1 | 3 | S6 |
| EMP-02 | EMP | Modal сотрудника | P1 | 3 | S6 |
| EMP-03 | EMP | Server Actions | P1 | 2 | S6 |
| CAL-01 | CAL | Рабочий календарь | P2 | 4 | S6 |
| FIN-01 | FIN | Страница Финансы | P1 | 3 | S7 |
| FIN-02 | FIN | Modal транзакции | P1 | 2 | S7 |
| FIN-03 | FIN | Server Actions | P1 | 1.5 | S7 |
| SAL-01 | SAL | Список зарплат | P1 | 3 | S7 |
| SAL-02 | SAL | Расчётный лист | P2 | 2 | S7 |
| SAL-03 | SAL | Server Actions | P1 | 1.5 | S7 |
| NOTIF-01 | NOTIF | Страница уведомлений | P2 | 2 | S8 |
| NOTIF-02 | NOTIF | Realtime уведомления | P2 | 1.5 | S8 |
| SET-01 | SET | Настройки компании | P2 | 2 | S8 |
| SET-02 | SET | KPI шаблоны | P2 | 2 | S8 |
| SET-03 | SET | Безопасность | P2 | 1.5 | S8 |
| DOC-01 | DOC | Страница документов | P3 | 3 | S8 |
| INT-01 | INT | Страница интеграций | P3 | 2 | S9 |
| INT-02 | INT | Telegram Bot | P3 | 8 | S9 |

---

## Правила ведения Backlog

1. **Никакая задача не начинается без перехода в статус In Progress**
2. **Зависимости — блокеры.** Нельзя начать задачу если зависимость не в Done
3. **P0 задачи не могут быть отложены** без согласования
4. **Каждый Sprint** начинается со Sprint Planning и заканчивается Sprint Review
5. **При обнаружении новой задачи** — добавить в Backlog с ID, не начинать без планирования
6. **Отклонение от плана** фиксируется в этом документе в разделе "История изменений"

---

## История изменений

| Дата | Версия | Изменение |
|------|--------|-----------|
| 2025-06-27 | 1.0 | Создание документа. 52 задачи, 10 спринтов. |
| 2026-06-27 | 2.0 | Реструктуризация Sprint 5–11. Сотрудники перенесены в S5 (✅). Новый порядок: S6 Декомпозиция, S7 Конструктор мотивации, S8 Зарплата, S9 Финансы, S10 Товароучёт, S11 Аналитика и AI. Итого ~174 часа, ~20 недель. |

---

*Этот документ является единственным источником правды для управления разработкой МОСТОВОЙ OS.*
*При конфликте между планом и реальностью — обновить этот документ, не игнорировать расхождение.*

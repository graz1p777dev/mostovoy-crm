# МОСТОВОЙ OS — Database Schema v1.0

> Единственный источник истины для структуры базы данных.
> Платформа: Supabase (PostgreSQL 15+)
> Project ref: `rjzmxgiqleftwcsxgfte`
> Основа: `07_Pages_Specification.md` · `01_Vision_Architecture.md`
> Статус: Проектирование завершено. Код не затронут.

---

## Соглашения и стандарты

### Именование

- Таблицы: `snake_case`, множественное число (`employees`, `consultations`)
- Поля: `snake_case` (`created_at`, `employee_id`)
- Primary Key: всегда `id UUID DEFAULT gen_random_uuid()`
- Foreign Keys: `{referenced_table_singular}_id` (`employee_id`, `role_id`)
- Timestamps: `created_at`, `updated_at` — в каждой таблице
- Soft delete: поле `deleted_at TIMESTAMPTZ` (NULL = активная запись)
- Boolean поля: с префиксом `is_` или `has_` (`is_active`, `is_nv`)

### Типы данных

| Назначение | PostgreSQL тип | Примечание |
|-----------|---------------|------------|
| ID | `UUID` | `gen_random_uuid()` |
| Деньги | `NUMERIC(12,2)` | Не FLOAT, чтобы избежать погрешности |
| Проценты | `NUMERIC(5,2)` | 0.00 – 100.00 |
| Даты | `DATE` | без времени |
| Дата + время | `TIMESTAMPTZ` | всегда с timezone |
| Текст короткий | `VARCHAR(255)` | имена, заголовки |
| Текст длинный | `TEXT` | комментарии, описания |
| Статусы | `TEXT` + CHECK | перечисляемые значения |
| JSON-данные | `JSONB` | настройки, метаданные |
| Массивы | `TEXT[]` | список значений |
| Телефон | `VARCHAR(20)` | +996 XXX XXX-XX-XX |

### Обязательные поля каждой таблицы

```sql
id         UUID        PRIMARY KEY DEFAULT gen_random_uuid()
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

`updated_at` обновляется автоматически через trigger `set_updated_at()`.

### RLS (Row Level Security)

Все таблицы имеют RLS ENABLED.

**Базовые роли Supabase Auth:**
- `authenticated` — любой залогиненный пользователь
- `anon` — незалогиненный (доступ закрыт везде кроме public данных)

**Пользовательские роли (через `employees.role`):**
- `owner` — владелец компании
- `rop` — руководитель отдела продаж
- `mp` — менеджер по продажам
- `lmai` — менеджер по лидогенерации
- `accountant` — бухгалтер

Роль пользователя проверяется через функцию:
```
get_my_role() → TEXT  -- читает employees.role для текущего auth.uid()
```

---

## Схема зависимостей (граф)

```
auth.users (Supabase Auth)
    └── employees ──────────────────────────────────────────────┐
            ├── schedules                                       │
            ├── attendance                                      │
            ├── employee_kpi ←── kpi_templates                 │
            ├── salaries ←── salary_calculations               │
            ├── consultations ──→ consultation_results         │
            ├── daily_facts                                     │
            └── decomposition                                   │
                                                                │
roles ──→ permissions                                           │
departments ──→ employees ──────────────────────────────────────┘

finances ←── finance_transactions ←── finance_categories
investors ──→ investor_payouts ──→ finances

notifications ──→ employees
documents ──→ employees
audit_logs ──→ employees + все таблицы
settings (singleton)
integrations
```

---

## 1. `auth.users` — Supabase Auth (системная)

> Управляется Supabase Auth. Не редактируется напрямую.

**Связь:** `auth.users.id` ← `employees.user_id`

При создании сотрудника → GoTrue Admin API создаёт пользователя.
Email + пароль → JWT токен → RLS policies используют `auth.uid()`.

---

## 2. `roles`

### Назначение

Справочник ролей в системе. Определяет уровень доступа.

### Поля

| Поле | Тип | NOT NULL | Default | Описание |
|------|-----|----------|---------|---------|
| `id` | UUID | ✓ | gen_random_uuid() | PK |
| `name` | VARCHAR(50) | ✓ | — | Системное имя: owner, rop, mp, lmai, accountant |
| `label` | VARCHAR(100) | ✓ | — | Отображаемое: Владелец, РОП, МП, LMAI, Бухгалтер |
| `description` | TEXT | — | NULL | Описание роли |
| `is_system` | BOOLEAN | ✓ | false | Системная роль (нельзя удалить) |
| `created_at` | TIMESTAMPTZ | ✓ | NOW() | |
| `updated_at` | TIMESTAMPTZ | ✓ | NOW() | |

### Ограничения

```
UNIQUE (name)
CHECK (name IN ('owner','rop','mp','lmai','accountant','custom'))
```

### Индексы

```
idx_roles_name ON roles(name)
```

### RLS политики

```
SELECT: authenticated (все видят список ролей)
INSERT/UPDATE/DELETE: owner только
```

### Данные (seed при инициализации)

```
owner      → Владелец
rop        → Руководитель отдела продаж
mp         → Менеджер по продажам
lmai       → Менеджер по лидогенерации
accountant → Бухгалтер
```

### Используется

- Страницы: Сотрудники, Настройки → Роли
- Таблицы: `employees.role`, `permissions.role_id`

---

## 3. `permissions`

### Назначение

Матрица прав доступа: какая роль что может делать с каким ресурсом.

### Поля

| Поле | Тип | NOT NULL | Default | Описание |
|------|-----|----------|---------|---------|
| `id` | UUID | ✓ | gen_random_uuid() | PK |
| `role_id` | UUID | ✓ | — | FK → roles.id |
| `resource` | VARCHAR(100) | ✓ | — | Ресурс: dashboard, finances, salaries, etc. |
| `can_view` | BOOLEAN | ✓ | false | Право просмотра |
| `can_create` | BOOLEAN | ✓ | false | Право создания |
| `can_edit` | BOOLEAN | ✓ | false | Право редактирования |
| `can_delete` | BOOLEAN | ✓ | false | Право удаления |
| `scope` | TEXT | ✓ | 'own' | 'own' / 'team' / 'all' |
| `created_at` | TIMESTAMPTZ | ✓ | NOW() | |
| `updated_at` | TIMESTAMPTZ | ✓ | NOW() | |

### Ограничения

```
UNIQUE (role_id, resource)
CHECK (scope IN ('own','team','all'))
```

### Индексы

```
idx_permissions_role_id ON permissions(role_id)
idx_permissions_resource ON permissions(resource)
```

### RLS политики

```
SELECT: authenticated
INSERT/UPDATE/DELETE: owner только
```

### Примечание о scope

- `own` — видит только свои записи
- `team` — видит записи своей команды (РОП)
- `all` — видит все записи (Владелец, Бухгалтер)

---

## 4. `departments`

### Назначение

Отделы компании. MVP: один отдел (продаж). Расширяется в будущем.

### Поля

| Поле | Тип | NOT NULL | Default | Описание |
|------|-----|----------|---------|---------|
| `id` | UUID | ✓ | gen_random_uuid() | PK |
| `name` | VARCHAR(100) | ✓ | — | Название отдела |
| `description` | TEXT | — | NULL | Описание |
| `manager_id` | UUID | — | NULL | FK → employees.id (руководитель) |
| `is_active` | BOOLEAN | ✓ | true | Активный отдел |
| `created_at` | TIMESTAMPTZ | ✓ | NOW() | |
| `updated_at` | TIMESTAMPTZ | ✓ | NOW() | |

### Индексы

```
idx_departments_manager_id ON departments(manager_id)
```

### RLS политики

```
SELECT: authenticated
INSERT/UPDATE/DELETE: owner только
```

---

## 5. `employees`

### Назначение

Центральная таблица системы. Каждый сотрудник компании.
Связывает Supabase Auth с бизнес-данными.

### Поля

| Поле | Тип | NOT NULL | Default | Описание |
|------|-----|----------|---------|---------|
| `id` | UUID | ✓ | gen_random_uuid() | PK |
| `user_id` | UUID | — | NULL | FK → auth.users.id (UNIQUE) |
| `department_id` | UUID | — | NULL | FK → departments.id |
| `name` | VARCHAR(255) | ✓ | — | Полное имя |
| `phone` | VARCHAR(20) | — | NULL | Телефон |
| `email` | VARCHAR(255) | ✓ | — | Email (совпадает с auth.users.email) |
| `role` | TEXT | ✓ | 'mp' | owner/rop/mp/lmai/accountant |
| `avatar_url` | TEXT | — | NULL | URL аватара (Supabase Storage) |
| `hire_date` | DATE | — | NULL | Дата начала работы |
| `birth_date` | DATE | — | NULL | Дата рождения |
| `base_salary` | NUMERIC(12,2) | ✓ | 0 | Базовый оклад (KGS) |
| `kpi_coefficient` | NUMERIC(5,2) | ✓ | 1.0 | Коэффициент KPI-бонуса |
| `schedule_type` | TEXT | ✓ | '5/2' | 5/2, 2/2, 1/1, 3/3, custom |
| `work_start_time` | TIME | — | '09:00' | Начало смены |
| `work_end_time` | TIME | — | '18:00' | Конец смены |
| `status` | TEXT | ✓ | 'active' | active / probation / archived |
| `notes` | TEXT | — | NULL | Внутренние заметки |
| `deleted_at` | TIMESTAMPTZ | — | NULL | Soft delete |
| `created_at` | TIMESTAMPTZ | ✓ | NOW() | |
| `updated_at` | TIMESTAMPTZ | ✓ | NOW() | |

### Ограничения

```
UNIQUE (user_id)
UNIQUE (email)
CHECK (role IN ('owner','rop','mp','lmai','accountant'))
CHECK (status IN ('active','probation','archived'))
CHECK (schedule_type IN ('5/2','2/2','1/1','3/3','weekends','custom'))
CHECK (base_salary >= 0)
CHECK (kpi_coefficient >= 0)
```

### Индексы

```
idx_employees_user_id   ON employees(user_id)
idx_employees_role      ON employees(role)
idx_employees_status    ON employees(status)
idx_employees_deleted   ON employees(deleted_at) WHERE deleted_at IS NULL
```

### RLS политики

```
SELECT:
  owner/accountant  → все записи WHERE deleted_at IS NULL
  rop               → своя команда + себя (WHERE department_id = свой или id = свой)
  mp/lmai           → только себя (WHERE user_id = auth.uid())

INSERT:  owner только
UPDATE:
  owner     → все поля
  mp/lmai   → только свои: phone, avatar_url
DELETE:  owner только (soft delete через deleted_at)
```

### Страницы

- Сотрудники (CRUD)
- Dashboard (команда, KPI)
- Декомпозиция (список сотрудников)
- Зарплаты (base_salary, kpi_coefficient)
- Записи (список менеджеров)

### Автоматизации

- При создании → GoTrue Admin создаёт auth.users запись
- При archived → auth.users деактивируется
- При изменении schedule_type → пересчёт выходных дней в schedules

---

## 6. `schedules`

### Назначение

Индивидуальное расписание сотрудника по дням месяца.
Генерируется автоматически в начале каждого месяца на основе `employees.schedule_type`.

### Поля

| Поле | Тип | NOT NULL | Default | Описание |
|------|-----|----------|---------|---------|
| `id` | UUID | ✓ | gen_random_uuid() | PK |
| `employee_id` | UUID | ✓ | — | FK → employees.id |
| `date` | DATE | ✓ | — | Конкретный день |
| `is_workday` | BOOLEAN | ✓ | true | Рабочий день или выходной |
| `work_start` | TIME | — | NULL | Начало смены (переопределение) |
| `work_end` | TIME | — | NULL | Конец смены (переопределение) |
| `note` | TEXT | — | NULL | Примечание |
| `created_at` | TIMESTAMPTZ | ✓ | NOW() | |
| `updated_at` | TIMESTAMPTZ | ✓ | NOW() | |

### Ограничения

```
UNIQUE (employee_id, date)
```

### Индексы

```
idx_schedules_employee_id  ON schedules(employee_id)
idx_schedules_date         ON schedules(date)
idx_schedules_emp_date     ON schedules(employee_id, date)
```

### RLS политики

```
SELECT:
  owner/rop  → все записи
  mp/lmai    → только свои (WHERE employee_id = get_my_employee_id())

INSERT/UPDATE/DELETE: owner, rop только
```

### Страницы

- Рабочий календарь (read/write)
- Декомпозиция (выходные дни в таблице)
- Зарплаты (количество рабочих дней)

### Автоматизации

- Cron: 1-е число каждого месяца → генерация расписания на месяц для всех сотрудников
- Изменение schedule_type в employees → регенерация будущих дней

---

## 7. `attendance`

### Назначение

Фактические явки: кто вышел на работу, кто на больничном, кто не пришёл.
Основа для расчёта рабочих дней в зарплате.

### Поля

| Поле | Тип | NOT NULL | Default | Описание |
|------|-----|----------|---------|---------|
| `id` | UUID | ✓ | gen_random_uuid() | PK |
| `employee_id` | UUID | ✓ | — | FK → employees.id |
| `date` | DATE | ✓ | — | Дата |
| `status` | TEXT | ✓ | — | Тип явки |
| `comment` | TEXT | — | NULL | Причина (для больничного, штрафа) |
| `marked_by` | UUID | — | NULL | FK → employees.id (кто отметил) |
| `created_at` | TIMESTAMPTZ | ✓ | NOW() | |
| `updated_at` | TIMESTAMPTZ | ✓ | NOW() | |

### Статусы явки (CHECK)

```
'worked'     → Отработал
'sick'       → Больничный
'day_off'    → Отгул
'vacation'   → Отпуск
'absent'     → Неявка без причины
'remote'     → Удалённая работа
```

### Ограничения

```
UNIQUE (employee_id, date)
CHECK (status IN ('worked','sick','day_off','vacation','absent','remote'))
```

### Индексы

```
idx_attendance_employee_id  ON attendance(employee_id)
idx_attendance_date         ON attendance(date)
idx_attendance_emp_date     ON attendance(employee_id, date)
idx_attendance_status       ON attendance(status)
```

### RLS политики

```
SELECT:
  owner/rop/accountant → все
  mp/lmai              → только свои

INSERT/UPDATE: owner, rop
DELETE: owner только
```

### Страницы

- Рабочий календарь (CRUD)
- Декомпозиция (рабочие дни в таблице)
- Зарплаты (отработано дней)

### Автоматизации

- Если к 12:00 нет записи `worked` за сегодня → уведомление владельцу
- Ежемесячный подсчёт дней для salary_calculations

---

## 8. `kpi_templates`

### Назначение

Шаблоны KPI по ролям. Определяет веса метрик и пороги бонусов.
Создаётся в Настройках → KPI.

### Поля

| Поле | Тип | NOT NULL | Default | Описание |
|------|-----|----------|---------|---------|
| `id` | UUID | ✓ | gen_random_uuid() | PK |
| `role` | TEXT | ✓ | — | Роль: mp, lmai |
| `name` | VARCHAR(100) | ✓ | — | Название шаблона |
| `is_default` | BOOLEAN | ✓ | false | Используется по умолчанию для роли |
| `metrics` | JSONB | ✓ | '{}' | Структура метрик и весов |
| `min_threshold_pct` | NUMERIC(5,2) | ✓ | 30.0 | Минимум % для получения бонуса |
| `over_plan_coefficient` | NUMERIC(5,2) | ✓ | 1.2 | Коэффициент при >100% |
| `created_at` | TIMESTAMPTZ | ✓ | NOW() | |
| `updated_at` | TIMESTAMPTZ | ✓ | NOW() | |

### Структура поля `metrics` (JSONB)

```json
{
  "fv":       { "label": "ФВ",       "weight": 40 },
  "sales":    { "label": "Продажи",  "weight": 35 },
  "revenue":  { "label": "Выручка",  "weight": 25 }
}
```

Для LMAI:
```json
{
  "appeals":  { "label": "Обращения", "weight": 40 },
  "leads":    { "label": "Лиды",      "weight": 40 },
  "nv":       { "label": "НВ",        "weight": 20 }
}
```

Сумма weight всегда = 100.

### Ограничения

```
CHECK (role IN ('mp','lmai'))
UNIQUE (role, is_default) WHERE is_default = true  -- только один default на роль
```

### Индексы

```
idx_kpi_templates_role ON kpi_templates(role)
```

### RLS политики

```
SELECT: authenticated
INSERT/UPDATE/DELETE: owner только
```

### Страницы

- Настройки → KPI (CRUD)
- Зарплаты (расчёт бонуса)

---

## 9. `employee_kpi`

### Назначение

Индивидуальный план KPI сотрудника на конкретный месяц.
Может переопределять `kpi_templates` для конкретного человека.

### Поля

| Поле | Тип | NOT NULL | Default | Описание |
|------|-----|----------|---------|---------|
| `id` | UUID | ✓ | gen_random_uuid() | PK |
| `employee_id` | UUID | ✓ | — | FK → employees.id |
| `period_year` | SMALLINT | ✓ | — | Год (2025) |
| `period_month` | SMALLINT | ✓ | — | Месяц (1–12) |
| `kpi_template_id` | UUID | — | NULL | FK → kpi_templates.id |
| `plan_fv` | INTEGER | — | NULL | План ФВ на месяц |
| `plan_sales` | INTEGER | — | NULL | План продаж |
| `plan_revenue` | NUMERIC(12,2) | — | NULL | План выручки (KGS) |
| `plan_appeals` | INTEGER | — | NULL | План обращений (LMAI) |
| `plan_leads` | INTEGER | — | NULL | План лидов (LMAI) |
| `plan_nv` | INTEGER | — | NULL | План НВ |
| `plan_work_days` | SMALLINT | — | NULL | Плановых рабочих дней (авто из schedules) |
| `notes` | TEXT | — | NULL | Комментарий к плану |
| `created_by` | UUID | — | NULL | FK → employees.id |
| `created_at` | TIMESTAMPTZ | ✓ | NOW() | |
| `updated_at` | TIMESTAMPTZ | ✓ | NOW() | |

### Ограничения

```
UNIQUE (employee_id, period_year, period_month)
CHECK (period_month BETWEEN 1 AND 12)
CHECK (period_year BETWEEN 2020 AND 2100)
CHECK (plan_fv IS NULL OR plan_fv >= 0)
CHECK (plan_sales IS NULL OR plan_sales >= 0)
CHECK (plan_revenue IS NULL OR plan_revenue >= 0)
```

### Индексы

```
idx_employee_kpi_emp_id      ON employee_kpi(employee_id)
idx_employee_kpi_period      ON employee_kpi(period_year, period_month)
idx_employee_kpi_emp_period  ON employee_kpi(employee_id, period_year, period_month)
```

### RLS политики

```
SELECT:
  owner/rop  → все
  mp/lmai    → только свои

INSERT/UPDATE: owner, rop
DELETE: owner только
```

### Страницы

- Декомпозиция (план в таблице и Modal)
- Зарплаты (план для расчёта KPI)
- Dashboard (сравнение план/факт)

### Автоматизации

- Начало месяца: если нет записи → создаётся из kpi_templates (default для роли)
- `plan_work_days` считается автоматически из schedules при создании

---

## 10. `consultations`

### Назначение

Центральная операционная таблица. Каждая запись на консультацию / первичная встреча.
Основной источник данных для ФВ, Продаж, Выручки.

### Поля

| Поле | Тип | NOT NULL | Default | Описание |
|------|-----|----------|---------|---------|
| `id` | UUID | ✓ | gen_random_uuid() | PK |
| `manager_id` | UUID | — | NULL | FK → employees.id (МП, ответственный) |
| `recorded_by_id` | UUID | — | NULL | FK → employees.id (кто записал) |
| `date` | DATE | ✓ | — | Дата встречи |
| `time` | TIME | — | NULL | Время встречи |
| `client_name` | VARCHAR(255) | ✓ | — | Имя клиента |
| `phone` | VARCHAR(20) | — | NULL | Телефон клиента |
| `deal_number` | VARCHAR(20) | — | NULL | Номер сделки в amoCRM (#1234567) |
| `format` | TEXT | — | NULL | Онлайн / Офлайн |
| `recorded_by` | VARCHAR(255) | — | NULL | Имя того, кто записал (текст, если не сотрудник) |
| `status` | TEXT | — | NULL | Планируемый статус |
| `actual_status` | TEXT | — | NULL | Фактический статус |
| `status_after_fv` | TEXT | — | NULL | Результат после встречи |
| `amount` | NUMERIC(12,2) | ✓ | 0 | Сумма продажи (KGS) |
| `delivery_cost` | NUMERIC(12,2) | ✓ | 0 | Расходы доставки |
| `is_nv` | BOOLEAN | ✓ | false | Клиент без предварительной записи (НВ) |
| `comment` | TEXT | — | NULL | Комментарий |
| `deleted_at` | TIMESTAMPTZ | — | NULL | Soft delete |
| `created_at` | TIMESTAMPTZ | ✓ | NOW() | |
| `updated_at` | TIMESTAMPTZ | ✓ | NOW() | |

### Статусы (CHECK значения)

```sql
-- status (планируемый)
CHECK (status IS NULL OR status IN (
  'Придёт','Не придёт','Перезапись','Отменил','Не отвечает'
))

-- actual_status (фактический)
CHECK (actual_status IS NULL OR actual_status IN (
  'Пришла','Не пришла'
))

-- status_after_fv (после встречи)
CHECK (status_after_fv IS NULL OR status_after_fv IN (
  'Купила','Не купила','Предоплата','Дожать','Отказ'
))

-- format
CHECK (format IS NULL OR format IN ('Онлайн','Офлайн'))
```

### Ограничения

```
CHECK (amount >= 0)
CHECK (delivery_cost >= 0)
-- Если status_after_fv = 'Отказ', comment должен быть заполнен (проверка на уровне приложения)
```

### Индексы

```
idx_consultations_manager_id    ON consultations(manager_id)
idx_consultations_date          ON consultations(date)
idx_consultations_status_after  ON consultations(status_after_fv)
idx_consultations_is_nv         ON consultations(is_nv)
idx_consultations_deleted       ON consultations(deleted_at) WHERE deleted_at IS NULL
idx_consultations_date_manager  ON consultations(date, manager_id)
idx_consultations_client_phone  ON consultations(phone)
```

### RLS политики

```
SELECT:
  owner/rop  → все WHERE deleted_at IS NULL
  mp/lmai    → только свои (WHERE manager_id = get_my_employee_id()) WHERE deleted_at IS NULL

INSERT:
  owner/rop/mp/lmai → можно создавать

UPDATE:
  owner/rop  → любую запись
  mp/lmai    → только свои (WHERE manager_id = get_my_employee_id())

DELETE (soft):
  owner/rop  → любую
  mp/lmai    → только свои
```

### Страницы

- Записи на консультацию (CRUD)
- Dashboard (лента событий, ФВ сегодня)
- Декомпозиция (агрегат ФВ/Продажи/Выручки)

### Автоматизации

При `status_after_fv` = 'Купила' или 'Предоплата':
- → Создать запись в `finance_transactions` (тип: доход, категория: продажа)
- → Обновить `daily_facts.sales_fact` и `daily_facts.revenue_fact` для менеджера за этот день (если нет ручного override)

---

## 11. `consultation_results`

### Назначение

Дополнительные данные о результате консультации.
Отделена от consultations для расширяемости (будущие поля без изменения основной таблицы).

### Поля

| Поле | Тип | NOT NULL | Default | Описание |
|------|-----|----------|---------|---------|
| `id` | UUID | ✓ | gen_random_uuid() | PK |
| `consultation_id` | UUID | ✓ | — | FK → consultations.id (UNIQUE) |
| `rejection_reason` | TEXT | — | NULL | Причина отказа (обязательна при Отказ) |
| `next_contact_date` | DATE | — | NULL | Дата следующего контакта (Дожать) |
| `product_sold` | VARCHAR(255) | — | NULL | Что именно продали |
| `is_repeat_client` | BOOLEAN | — | false | Повторный клиент |
| `source` | TEXT | — | NULL | Источник клиента (Instagram, сарафан и др.) |
| `extra_data` | JSONB | — | NULL | Дополнительные поля (расширяемость) |
| `created_at` | TIMESTAMPTZ | ✓ | NOW() | |
| `updated_at` | TIMESTAMPTZ | ✓ | NOW() | |

### Ограничения

```
UNIQUE (consultation_id)
```

### Индексы

```
idx_consultation_results_cons_id  ON consultation_results(consultation_id)
idx_consultation_results_source   ON consultation_results(source)
```

### RLS политики

Наследует логику от `consultations` (через JOIN или отдельные политики).

```
SELECT: owner/rop — все; mp/lmai — только свои консультации
INSERT/UPDATE: owner/rop/mp (только своя консультация)
```

---

## 12. `daily_facts`

### Назначение

Ежедневные фактические показатели сотрудника.
Ручной override данных из consultations (имеет приоритет).
Также хранит данные LMAI (обращения, лиды), которые не в consultations.

### Поля

| Поле | Тип | NOT NULL | Default | Описание |
|------|-----|----------|---------|---------|
| `id` | UUID | ✓ | gen_random_uuid() | PK |
| `employee_id` | UUID | ✓ | — | FK → employees.id |
| `date` | DATE | ✓ | — | День |
| `fv_fact` | INTEGER | — | NULL | ФВ фактически (override) |
| `sales_fact` | INTEGER | — | NULL | Продажи фактически (override) |
| `revenue_fact` | NUMERIC(12,2) | — | NULL | Выручка фактически (override) |
| `nv_fact` | INTEGER | — | NULL | НВ фактически |
| `nv_sales_fact` | INTEGER | — | NULL | Продажи НВ |
| `nv_revenue_fact` | NUMERIC(12,2) | — | NULL | Выручка НВ |
| `appeals_fact` | INTEGER | — | NULL | Обращения (для LMAI) |
| `leads_fact` | INTEGER | — | NULL | Лиды (для LMAI) |
| `notes` | TEXT | — | NULL | Комментарий |
| `created_by` | UUID | — | NULL | FK → employees.id (кто вносил) |
| `created_at` | TIMESTAMPTZ | ✓ | NOW() | |
| `updated_at` | TIMESTAMPTZ | ✓ | NOW() | |

### Ограничения

```
UNIQUE (employee_id, date)
CHECK (fv_fact IS NULL OR fv_fact >= 0)
CHECK (sales_fact IS NULL OR sales_fact >= 0)
CHECK (revenue_fact IS NULL OR revenue_fact >= 0)
```

### Индексы

```
idx_daily_facts_emp_id   ON daily_facts(employee_id)
idx_daily_facts_date     ON daily_facts(date)
idx_daily_facts_emp_date ON daily_facts(employee_id, date)
```

### RLS политики

```
SELECT:
  owner/rop  → все
  mp/lmai    → только свои

INSERT/UPDATE:
  owner/rop  → любые
  mp/lmai    → только свои

DELETE: owner только
```

### Логика приоритета (на уровне приложения)

```
Если daily_facts.fv_fact IS NOT NULL → использовать его
Иначе → COUNT(consultations) WHERE actual_status = 'Пришла' AND date = X AND manager_id = Y
```

### Страницы

- Декомпозиция (ячейки факта)
- Dashboard (метрики дня)

### Автоматизации

- При изменении consultations.status → пересчёт в daily_facts (если нет override)
- Ежедневно в 23:59 → snapshot агрегата за день (для истории)

---

## 13. `decomposition`

### Назначение

Агрегированный план-факт по сотруднику за месяц.
Хранит итоговые значения для быстрого доступа (materialized view логика).

### Поля

| Поле | Тип | NOT NULL | Default | Описание |
|------|-----|----------|---------|---------|
| `id` | UUID | ✓ | gen_random_uuid() | PK |
| `employee_id` | UUID | ✓ | — | FK → employees.id |
| `period_year` | SMALLINT | ✓ | — | Год |
| `period_month` | SMALLINT | ✓ | — | Месяц (1–12) |
| `total_fv_plan` | INTEGER | ✓ | 0 | ФВ план |
| `total_fv_fact` | INTEGER | ✓ | 0 | ФВ факт (агрегат) |
| `total_sales_plan` | INTEGER | ✓ | 0 | Продажи план |
| `total_sales_fact` | INTEGER | ✓ | 0 | Продажи факт |
| `total_revenue_plan` | NUMERIC(12,2) | ✓ | 0 | Выручка план |
| `total_revenue_fact` | NUMERIC(12,2) | ✓ | 0 | Выручка факт |
| `total_work_days_plan` | SMALLINT | ✓ | 0 | Рабочих дней план |
| `total_work_days_fact` | SMALLINT | ✓ | 0 | Рабочих дней факт |
| `kpi_pct` | NUMERIC(5,2) | ✓ | 0 | Итоговый KPI % |
| `last_calculated_at` | TIMESTAMPTZ | — | NULL | Когда последний раз пересчитывалось |
| `created_at` | TIMESTAMPTZ | ✓ | NOW() | |
| `updated_at` | TIMESTAMPTZ | ✓ | NOW() | |

### Ограничения

```
UNIQUE (employee_id, period_year, period_month)
CHECK (period_month BETWEEN 1 AND 12)
CHECK (kpi_pct >= 0)
```

### Индексы

```
idx_decomposition_emp_id    ON decomposition(employee_id)
idx_decomposition_period    ON decomposition(period_year, period_month)
idx_decomposition_emp_per   ON decomposition(employee_id, period_year, period_month)
```

### RLS политики

```
SELECT:
  owner/rop  → все
  mp/lmai    → только свои

INSERT/UPDATE: система (через server-side functions)
DELETE: owner только
```

### Страницы

- Декомпозиция (сводка месяца)
- Dashboard (KPI команды)
- Зарплаты (KPI% для расчёта)

### Автоматизации

- Пересчитывается при изменении consultations, daily_facts
- Ежедневно в 23:59 → полный пересчёт всех активных сотрудников за текущий месяц
- Начало месяца → инициализация записи из employee_kpi

---

## 14. `salaries`

### Назначение

Итоговая зарплата сотрудника за месяц (что выплачено или запланировано к выплате).

### Поля

| Поле | Тип | NOT NULL | Default | Описание |
|------|-----|----------|---------|---------|
| `id` | UUID | ✓ | gen_random_uuid() | PK |
| `employee_id` | UUID | ✓ | — | FK → employees.id |
| `period_year` | SMALLINT | ✓ | — | Год |
| `period_month` | SMALLINT | ✓ | — | Месяц |
| `base_salary` | NUMERIC(12,2) | ✓ | 0 | Оклад за месяц |
| `kpi_bonus` | NUMERIC(12,2) | ✓ | 0 | KPI бонус |
| `bonuses` | NUMERIC(12,2) | ✓ | 0 | Ручные бонусы |
| `deductions` | NUMERIC(12,2) | ✓ | 0 | Штрафы и удержания |
| `total_amount` | NUMERIC(12,2) | ✓ | 0 | Итого к выплате |
| `kpi_pct` | NUMERIC(5,2) | ✓ | 0 | % выполнения KPI |
| `work_days_fact` | SMALLINT | ✓ | 0 | Отработано дней |
| `work_days_plan` | SMALLINT | ✓ | 0 | Плановых дней |
| `status` | TEXT | ✓ | 'draft' | draft / calculated / paid |
| `paid_at` | TIMESTAMPTZ | — | NULL | Дата выплаты |
| `paid_by` | UUID | — | NULL | FK → employees.id (кто выплатил) |
| `notes` | TEXT | — | NULL | Примечания |
| `calculated_at` | TIMESTAMPTZ | — | NULL | Дата расчёта |
| `created_at` | TIMESTAMPTZ | ✓ | NOW() | |
| `updated_at` | TIMESTAMPTZ | ✓ | NOW() | |

### Ограничения

```
UNIQUE (employee_id, period_year, period_month)
CHECK (status IN ('draft','calculated','paid'))
CHECK (period_month BETWEEN 1 AND 12)
CHECK (total_amount >= 0)
```

### Индексы

```
idx_salaries_emp_id    ON salaries(employee_id)
idx_salaries_period    ON salaries(period_year, period_month)
idx_salaries_status    ON salaries(status)
```

### RLS политики

```
SELECT:
  owner/accountant → все
  rop              → своя команда
  mp/lmai          → только свою

INSERT/UPDATE: owner, accountant
DELETE: owner только
```

### Страницы

- Зарплаты (список и детали)
- Финансы (авто-транзакция при выплате)

### Автоматизации

- Конец месяца → автоматический расчёт для всех (`status = 'calculated'`)
- При `status` → 'paid' → создать `finance_transactions` (тип: расход, категория: зарплата)

---

## 15. `salary_calculations`

### Назначение

Детальный лог расчёта зарплаты. Хранит построчно каждую составляющую.
Используется для расчётного листа и аудита.

### Поля

| Поле | Тип | NOT NULL | Default | Описание |
|------|-----|----------|---------|---------|
| `id` | UUID | ✓ | gen_random_uuid() | PK |
| `salary_id` | UUID | ✓ | — | FK → salaries.id |
| `type` | TEXT | ✓ | — | Тип строки |
| `description` | VARCHAR(255) | ✓ | — | Описание |
| `amount` | NUMERIC(12,2) | ✓ | — | Сумма (+ доход, - вычет) |
| `metric_name` | VARCHAR(100) | — | NULL | Метрика (ФВ, Продажи...) |
| `metric_plan` | NUMERIC(10,2) | — | NULL | Плановое значение метрики |
| `metric_fact` | NUMERIC(10,2) | — | NULL | Фактическое значение |
| `metric_pct` | NUMERIC(5,2) | — | NULL | % выполнения |
| `weight` | NUMERIC(5,2) | — | NULL | Вес метрики в KPI |
| `created_at` | TIMESTAMPTZ | ✓ | NOW() | |

### Типы строк (CHECK)

```
'base_salary'    → оклад
'kpi_bonus'      → KPI бонус
'manual_bonus'   → ручной бонус
'deduction'      → штраф / вычет
'day_adjustment' → корректировка за неполный месяц
```

### Ограничения

```
CHECK (type IN ('base_salary','kpi_bonus','manual_bonus','deduction','day_adjustment'))
```

### Индексы

```
idx_salary_calc_salary_id ON salary_calculations(salary_id)
```

### RLS политики

```
SELECT: следует политике salaries (через salary_id)
INSERT/UPDATE/DELETE: owner, accountant (только через функцию расчёта)
```

---

## 16. `finance_categories`

### Назначение

Справочник категорий доходов и расходов.

### Поля

| Поле | Тип | NOT NULL | Default | Описание |
|------|-----|----------|---------|---------|
| `id` | UUID | ✓ | gen_random_uuid() | PK |
| `name` | VARCHAR(100) | ✓ | — | Название категории |
| `type` | TEXT | ✓ | — | income / expense |
| `color` | VARCHAR(7) | — | '#6b7280' | HEX цвет для графика |
| `icon` | VARCHAR(50) | — | NULL | Lucide icon name |
| `is_system` | BOOLEAN | ✓ | false | Системная (нельзя удалить) |
| `is_active` | BOOLEAN | ✓ | true | Активная |
| `created_at` | TIMESTAMPTZ | ✓ | NOW() | |
| `updated_at` | TIMESTAMPTZ | ✓ | NOW() | |

### Системные категории (seed)

**Доходы:**
- Продажи (is_system=true, авто из consultations)
- Инвестиции
- Прочие поступления

**Расходы:**
- Зарплата (is_system=true, авто из salaries)
- Аренда
- Маркетинг / Реклама
- Доставка
- Коммунальные
- Прочее

### Ограничения

```
CHECK (type IN ('income','expense'))
UNIQUE (name, type)
```

### Индексы

```
idx_finance_categories_type ON finance_categories(type)
```

### RLS политики

```
SELECT: owner, accountant, rop (для просмотра)
INSERT/UPDATE/DELETE: owner, accountant
```

---

## 17. `finance_transactions`

### Назначение

Каждая финансовая операция: доход или расход.
Может создаваться вручную или автоматически (из продаж, зарплат).

### Поля

| Поле | Тип | NOT NULL | Default | Описание |
|------|-----|----------|---------|---------|
| `id` | UUID | ✓ | gen_random_uuid() | PK |
| `category_id` | UUID | ✓ | — | FK → finance_categories.id |
| `type` | TEXT | ✓ | — | income / expense |
| `amount` | NUMERIC(12,2) | ✓ | — | Сумма (всегда положительная) |
| `date` | DATE | ✓ | — | Дата операции |
| `description` | TEXT | — | NULL | Описание |
| `source_type` | TEXT | — | NULL | Источник: manual / consultation / salary / payout |
| `source_id` | UUID | — | NULL | ID исходного объекта (consultation.id / salary.id) |
| `created_by` | UUID | — | NULL | FK → employees.id |
| `document_id` | UUID | — | NULL | FK → documents.id (прикреплённый документ) |
| `deleted_at` | TIMESTAMPTZ | — | NULL | Soft delete |
| `created_at` | TIMESTAMPTZ | ✓ | NOW() | |
| `updated_at` | TIMESTAMPTZ | ✓ | NOW() | |

### Ограничения

```
CHECK (type IN ('income','expense'))
CHECK (amount > 0)
CHECK (source_type IS NULL OR source_type IN ('manual','consultation','salary','investor_payout'))
```

### Индексы

```
idx_fin_trans_category_id  ON finance_transactions(category_id)
idx_fin_trans_type         ON finance_transactions(type)
idx_fin_trans_date         ON finance_transactions(date)
idx_fin_trans_source       ON finance_transactions(source_type, source_id)
idx_fin_trans_deleted      ON finance_transactions(deleted_at) WHERE deleted_at IS NULL
```

### RLS политики

```
SELECT: owner, accountant
INSERT: owner, accountant (manual) + system (auto)
UPDATE: owner, accountant
DELETE (soft): owner только
```

### Страницы

- Финансы (CRUD и аналитика)
- Dashboard (финансовый блок)

### Автоматизации

- consultations: при Купила/Предоплата → INSERT (income, category: Продажи)
- salaries: при paid → INSERT (expense, category: Зарплата)
- investor_payouts: при создании → INSERT (expense, category: Выплата инвестору)

---

## 18. `finances`

### Назначение

Агрегированные финансовые итоги по месяцам (для быстрой аналитики на Dashboard).
Обновляется при каждом изменении finance_transactions.

### Поля

| Поле | Тип | NOT NULL | Default | Описание |
|------|-----|----------|---------|---------|
| `id` | UUID | ✓ | gen_random_uuid() | PK |
| `period_year` | SMALLINT | ✓ | — | Год |
| `period_month` | SMALLINT | ✓ | — | Месяц |
| `total_income` | NUMERIC(12,2) | ✓ | 0 | Итого доходов |
| `total_expense` | NUMERIC(12,2) | ✓ | 0 | Итого расходов |
| `net_profit` | NUMERIC(12,2) | ✓ | 0 | Прибыль (income - expense) |
| `margin_pct` | NUMERIC(5,2) | ✓ | 0 | Рентабельность % |
| `last_calculated_at` | TIMESTAMPTZ | — | NULL | |
| `created_at` | TIMESTAMPTZ | ✓ | NOW() | |
| `updated_at` | TIMESTAMPTZ | ✓ | NOW() | |

### Ограничения

```
UNIQUE (period_year, period_month)
```

### Индексы

```
idx_finances_period ON finances(period_year, period_month)
```

### RLS политики

```
SELECT: owner, accountant
INSERT/UPDATE: система (trigger на finance_transactions)
```

### Автоматизации

- Trigger на `finance_transactions` AFTER INSERT/UPDATE/DELETE → пересчёт finances за период

---

## 19. `investors`

### Назначение

Список инвесторов / соучредителей компании. Учёт их долей и выплат.

### Поля

| Поле | Тип | NOT NULL | Default | Описание |
|------|-----|----------|---------|---------|
| `id` | UUID | ✓ | gen_random_uuid() | PK |
| `name` | VARCHAR(255) | ✓ | — | ФИО инвестора |
| `phone` | VARCHAR(20) | — | NULL | Телефон |
| `email` | VARCHAR(255) | — | NULL | Email |
| `share_pct` | NUMERIC(5,2) | ✓ | 0 | Доля в % |
| `investment_amount` | NUMERIC(12,2) | ✓ | 0 | Сумма вклада |
| `investment_date` | DATE | — | NULL | Дата вклада |
| `is_active` | BOOLEAN | ✓ | true | Активный |
| `notes` | TEXT | — | NULL | Заметки |
| `created_at` | TIMESTAMPTZ | ✓ | NOW() | |
| `updated_at` | TIMESTAMPTZ | ✓ | NOW() | |

### Ограничения

```
CHECK (share_pct BETWEEN 0 AND 100)
CHECK (investment_amount >= 0)
```

### Индексы

```
idx_investors_is_active ON investors(is_active)
```

### RLS политики

```
SELECT: owner только
INSERT/UPDATE/DELETE: owner только
```

---

## 20. `investor_payouts`

### Назначение

Выплаты инвесторам (дивиденды, возврат доли).

### Поля

| Поле | Тип | NOT NULL | Default | Описание |
|------|-----|----------|---------|---------|
| `id` | UUID | ✓ | gen_random_uuid() | PK |
| `investor_id` | UUID | ✓ | — | FK → investors.id |
| `amount` | NUMERIC(12,2) | ✓ | — | Сумма выплаты |
| `date` | DATE | ✓ | — | Дата выплаты |
| `type` | TEXT | ✓ | 'dividend' | dividend / return / other |
| `description` | TEXT | — | NULL | Комментарий |
| `transaction_id` | UUID | — | NULL | FK → finance_transactions.id |
| `created_by` | UUID | — | NULL | FK → employees.id |
| `created_at` | TIMESTAMPTZ | ✓ | NOW() | |
| `updated_at` | TIMESTAMPTZ | ✓ | NOW() | |

### Ограничения

```
CHECK (amount > 0)
CHECK (type IN ('dividend','return','other'))
```

### Индексы

```
idx_investor_payouts_investor_id ON investor_payouts(investor_id)
idx_investor_payouts_date        ON investor_payouts(date)
```

### RLS политики

```
SELECT/INSERT/UPDATE/DELETE: owner только
```

### Автоматизации

- При создании → INSERT в `finance_transactions` (expense, category: Выплата инвестору)

---

## 21. `notifications`

### Назначение

Все системные уведомления пользователям.

### Поля

| Поле | Тип | NOT NULL | Default | Описание |
|------|-----|----------|---------|---------|
| `id` | UUID | ✓ | gen_random_uuid() | PK |
| `employee_id` | UUID | ✓ | — | FK → employees.id (получатель) |
| `type` | TEXT | ✓ | — | Тип уведомления |
| `title` | VARCHAR(255) | ✓ | — | Заголовок |
| `body` | TEXT | — | NULL | Текст уведомления |
| `action_url` | TEXT | — | NULL | Ссылка (куда ведёт клик) |
| `is_read` | BOOLEAN | ✓ | false | Прочитано |
| `is_important` | BOOLEAN | ✓ | false | Важное (выделяется) |
| `source_type` | TEXT | — | NULL | Откуда: system / kpi / finance / attendance |
| `source_id` | UUID | — | NULL | ID связанного объекта |
| `expires_at` | TIMESTAMPTZ | — | NULL | Срок актуальности |
| `created_at` | TIMESTAMPTZ | ✓ | NOW() | |

### Типы уведомлений (CHECK)

```
'kpi_alert'      → KPI отстаёт
'kpi_success'    → KPI выполнен
'plan_100'       → Метрика на 100%
'absence'        → Неявка сотрудника
'salary_ready'   → Зарплата рассчитана
'finance_alert'  → Финансовый алерт
'system'         → Системное
'sale'           → Новая продажа
```

### Ограничения

```
CHECK (type IN ('kpi_alert','kpi_success','plan_100','absence','salary_ready','finance_alert','system','sale'))
```

### Индексы

```
idx_notifications_emp_id   ON notifications(employee_id)
idx_notifications_is_read  ON notifications(is_read) WHERE is_read = false
idx_notifications_created  ON notifications(created_at DESC)
idx_notifications_type     ON notifications(type)
```

### RLS политики

```
SELECT: каждый видит только свои (WHERE employee_id = get_my_employee_id())
INSERT: система (server-side functions)
UPDATE: owner/сам пользователь → только is_read
DELETE: owner, или автоудаление по expires_at
```

### Страницы

- Уведомления (список)
- Topbar (badge + dropdown)

### Автоматизации

- Supabase Realtime → мгновенная доставка новых уведомлений
- Cron: каждое утро проверка KPI и явок → генерация алертов

---

## 22. `documents`

### Назначение

Метаданные файлов. Сами файлы хранятся в Supabase Storage.

### Поля

| Поле | Тип | NOT NULL | Default | Описание |
|------|-----|----------|---------|---------|
| `id` | UUID | ✓ | gen_random_uuid() | PK |
| `name` | VARCHAR(255) | ✓ | — | Имя файла |
| `original_name` | VARCHAR(255) | ✓ | — | Оригинальное имя |
| `category` | TEXT | ✓ | 'other' | Категория документа |
| `storage_path` | TEXT | ✓ | — | Путь в Supabase Storage |
| `mime_type` | VARCHAR(100) | — | NULL | MIME тип |
| `size_bytes` | BIGINT | — | NULL | Размер файла |
| `uploaded_by` | UUID | — | NULL | FK → employees.id |
| `related_type` | TEXT | — | NULL | salary / finance / employee / etc. |
| `related_id` | UUID | — | NULL | ID связанного объекта |
| `is_generated` | BOOLEAN | ✓ | false | Автогенерированный (расчётный лист и др.) |
| `deleted_at` | TIMESTAMPTZ | — | NULL | Soft delete |
| `created_at` | TIMESTAMPTZ | ✓ | NOW() | |
| `updated_at` | TIMESTAMPTZ | ✓ | NOW() | |

### Категории документов (CHECK)

```
'contract'     → Договоры
'regulation'   → Регламенты
'financial'    → Финансовые отчёты
'salary_sheet' → Расчётные листы
'template'     → Шаблоны
'other'        → Прочее
```

### Ограничения

```
CHECK (category IN ('contract','regulation','financial','salary_sheet','template','other'))
CHECK (size_bytes IS NULL OR size_bytes > 0)
```

### Индексы

```
idx_documents_category    ON documents(category)
idx_documents_related     ON documents(related_type, related_id)
idx_documents_uploaded_by ON documents(uploaded_by)
idx_documents_deleted     ON documents(deleted_at) WHERE deleted_at IS NULL
```

### RLS политики

```
SELECT: owner/accountant → все; rop → все; mp/lmai → только свои
INSERT: owner, accountant, система
UPDATE: owner, accountant
DELETE (soft): owner только
```

### Supabase Storage

```
Bucket: documents (private)
Path: {category}/{year}/{month}/{id}-{filename}

RLS на Storage:
  Чтение: только те, у кого есть доступ к documents.id
  Запись: owner, accountant, система
```

---

## 23. `integrations`

### Назначение

Настройки подключённых внешних сервисов.

### Поля

| Поле | Тип | NOT NULL | Default | Описание |
|------|-----|----------|---------|---------|
| `id` | UUID | ✓ | gen_random_uuid() | PK |
| `name` | VARCHAR(100) | ✓ | — | Название сервиса (amoCRM, Telegram, etc.) |
| `type` | TEXT | ✓ | — | crm / telegram / sheets / shop / other |
| `is_active` | BOOLEAN | ✓ | false | Подключён |
| `config` | JSONB | — | NULL | Конфигурация (зашифрованные ключи и др.) |
| `last_sync_at` | TIMESTAMPTZ | — | NULL | Последняя синхронизация |
| `last_sync_status` | TEXT | — | NULL | success / error |
| `last_sync_error` | TEXT | — | NULL | Текст ошибки |
| `webhook_url` | TEXT | — | NULL | Webhook URL (если нужен) |
| `created_at` | TIMESTAMPTZ | ✓ | NOW() | |
| `updated_at` | TIMESTAMPTZ | ✓ | NOW() | |

### Ограничения

```
CHECK (type IN ('crm','telegram','sheets','shop','other'))
UNIQUE (name)
```

### Индексы

```
idx_integrations_type      ON integrations(type)
idx_integrations_is_active ON integrations(is_active)
```

### RLS политики

```
SELECT: owner только
INSERT/UPDATE/DELETE: owner только
```

### Важно по безопасности

- `config` (JSONB) — хранит API ключи. Шифруется на уровне приложения до сохранения в БД.
- Никогда не возвращать config в SELECT по умолчанию — только через защищённую функцию.

---

## 24. `settings`

### Назначение

Глобальные настройки компании (singleton — одна строка на компанию).

### Поля

| Поле | Тип | NOT NULL | Default | Описание |
|------|-----|----------|---------|---------|
| `id` | UUID | ✓ | gen_random_uuid() | PK |
| `company_name` | VARCHAR(255) | ✓ | 'МОСТОВОЙ' | Название компании |
| `logo_url` | TEXT | — | NULL | URL логотипа |
| `timezone` | VARCHAR(50) | ✓ | 'Asia/Bishkek' | Часовой пояс |
| `currency` | VARCHAR(10) | ✓ | 'KGS' | Валюта |
| `week_start_day` | SMALLINT | ✓ | 1 | 1=Пн, 7=Вс |
| `month_start_day` | SMALLINT | ✓ | 1 | День начала рабочего месяца |
| `salary_close_day` | SMALLINT | ✓ | 25 | День закрытия зарплатного периода |
| `salary_pay_day` | SMALLINT | ✓ | 5 | День выплаты зарплаты (следующего месяца) |
| `default_work_start` | TIME | ✓ | '09:00' | Стандартное начало смены |
| `default_work_end` | TIME | ✓ | '18:00' | Стандартное окончание смены |
| `absence_alert_time` | TIME | ✓ | '12:00' | Время алерта о неявке |
| `kpi_alert_threshold` | NUMERIC(5,2) | ✓ | 30.0 | % порог для KPI алерта |
| `theme` | TEXT | ✓ | 'light' | light / dark / system |
| `language` | VARCHAR(5) | ✓ | 'ru' | Язык интерфейса |
| `extra` | JSONB | — | '{}' | Дополнительные настройки |
| `created_at` | TIMESTAMPTZ | ✓ | NOW() | |
| `updated_at` | TIMESTAMPTZ | ✓ | NOW() | |

### Ограничения

```
CHECK (week_start_day BETWEEN 1 AND 7)
CHECK (month_start_day BETWEEN 1 AND 28)
CHECK (salary_close_day BETWEEN 1 AND 31)
CHECK (salary_pay_day BETWEEN 1 AND 31)
CHECK (theme IN ('light','dark','system'))
```

### RLS политики

```
SELECT: authenticated (все видят нужные настройки: timezone, language)
UPDATE: owner только
INSERT: запрещён (singleton, создаётся при инициализации системы)
DELETE: запрещён
```

---

## 25. `audit_logs`

### Назначение

Лог всех действий пользователей в системе.
Кто, что, когда, с чем.
Неизменяемая таблица — append-only.

### Поля

| Поле | Тип | NOT NULL | Default | Описание |
|------|-----|----------|---------|---------|
| `id` | UUID | ✓ | gen_random_uuid() | PK |
| `employee_id` | UUID | — | NULL | FK → employees.id (кто совершил) |
| `action` | TEXT | ✓ | — | Действие: create/update/delete/login/logout |
| `resource_type` | TEXT | ✓ | — | Таблица: consultations/employees/salaries... |
| `resource_id` | UUID | — | NULL | ID изменённого объекта |
| `old_data` | JSONB | — | NULL | Данные до изменения |
| `new_data` | JSONB | — | NULL | Данные после изменения |
| `ip_address` | INET | — | NULL | IP адрес |
| `user_agent` | TEXT | — | NULL | User Agent браузера |
| `created_at` | TIMESTAMPTZ | ✓ | NOW() | Время события |

### Ограничения

```
CHECK (action IN ('create','update','delete','login','logout','export','view'))
-- Нет ON DELETE CASCADE — аудит не удаляется при удалении объекта
```

### Индексы

```
idx_audit_employee_id   ON audit_logs(employee_id)
idx_audit_action        ON audit_logs(action)
idx_audit_resource      ON audit_logs(resource_type, resource_id)
idx_audit_created_at    ON audit_logs(created_at DESC)
```

### RLS политики

```
SELECT: owner только
INSERT: authenticated (через server trigger, не напрямую)
UPDATE: ЗАПРЕЩЁН (append-only)
DELETE: ЗАПРЕЩЁН (append-only)
```

### Retention Policy

Хранится 12 месяцев. Записи старше 12 месяцев архивируются / удаляются через cron.

---

## Системные функции и триггеры

### `set_updated_at()`

```
Trigger на каждой таблице BEFORE UPDATE:
  NEW.updated_at = NOW()
```

Применяется ко всем таблицам с полем `updated_at`.

### `get_my_employee_id()`

```
RETURNS UUID
  SELECT id FROM employees WHERE user_id = auth.uid() LIMIT 1
```

Используется в RLS политиках.

### `get_my_role()`

```
RETURNS TEXT
  SELECT role FROM employees WHERE user_id = auth.uid() LIMIT 1
```

Используется в RLS политиках.

### `recalculate_decomposition(p_employee_id, p_year, p_month)`

```
Пересчитывает decomposition из consultations + daily_facts
Вызывается:
  - Trigger на consultations AFTER INSERT/UPDATE
  - Trigger на daily_facts AFTER INSERT/UPDATE
  - Cron job ежедневно 23:59
```

### `recalculate_finances(p_year, p_month)`

```
Пересчитывает finances из finance_transactions
Вызывается:
  - Trigger на finance_transactions AFTER INSERT/UPDATE/DELETE
```

### `generate_monthly_schedule(p_employee_id, p_year, p_month)`

```
Генерирует расписание из employees.schedule_type
Вызывается:
  - Cron job 1-е число каждого месяца
  - При изменении schedule_type в employees
```

### `calculate_salary(p_employee_id, p_year, p_month)`

```
Рассчитывает salary из:
  - employees.base_salary
  - decomposition.kpi_pct
  - kpi_templates (веса и коэффициенты)
  - attendance (рабочие дни)
  - salary_adjustments (бонусы/штрафы)
Создаёт salary + salary_calculations записи
```

---

## Cron Jobs (pg_cron / Supabase Edge Functions)

| Job | Расписание | Действие |
|-----|-----------|---------|
| `generate_schedules` | 1-е число месяца, 00:01 | Генерация расписания для всех |
| `init_employee_kpi` | 1-е число месяца, 00:05 | Инициализация планов из templates |
| `recalculate_all_decompositions` | Ежедневно 23:59 | Пересчёт декомпозиции |
| `check_absences` | Ежедневно 12:00 (рабочие дни) | Проверка явок → уведомления |
| `kpi_alerts` | Ежедневно 18:00 | Проверка KPI → алерты |
| `calculate_salaries` | 25-е число, 23:00 | Расчёт зарплат за месяц |
| `salary_notifications` | 26-е число, 09:00 | Уведомление о готовых зарплатах |
| `clean_audit_logs` | 1-е число, 02:00 | Удаление записей старше 12 мес. |
| `clean_notifications` | Еженедельно Вс 03:00 | Удаление прочитанных >30 дней |

---

## Supabase Realtime

Включить Realtime для таблиц:

| Таблица | Событие | Получатель |
|---------|---------|-----------|
| `consultations` | INSERT, UPDATE | Dashboard (лента событий) |
| `notifications` | INSERT | Все пользователи (свои) |
| `attendance` | INSERT, UPDATE | Dashboard (статус команды) |
| `daily_facts` | UPDATE | Декомпозиция (live обновление) |

---

## Supabase Storage

| Bucket | Тип | Назначение |
|--------|-----|-----------|
| `documents` | private | Документы компании |
| `avatars` | public | Аватары сотрудников |
| `logos` | public | Логотипы компании |

---

## Матрица доступа к таблицам

| Таблица | owner | rop | mp | lmai | accountant |
|---------|-------|-----|-----|------|-----------|
| roles | R/W | R | R | R | R |
| permissions | R/W | — | — | — | — |
| departments | R/W | R | — | — | — |
| employees | R/W | R | R (own) | R (own) | R |
| schedules | R/W | R/W | R (own) | R (own) | — |
| attendance | R/W | R/W | R (own) | R (own) | — |
| kpi_templates | R/W | R | R | R | — |
| employee_kpi | R/W | R/W | R (own) | R (own) | R |
| consultations | R/W | R/W | R/W (own) | R/W (own) | — |
| consultation_results | R/W | R/W | R/W (own) | — | — |
| daily_facts | R/W | R/W | R/W (own) | R/W (own) | — |
| decomposition | R/W | R (team) | R (own) | R (own) | — |
| salaries | R/W | R (team) | R (own) | R (own) | R/W |
| salary_calculations | R/W | R (team) | R (own) | R (own) | R/W |
| finance_categories | R/W | R | — | — | R/W |
| finance_transactions | R/W | — | — | — | R/W |
| finances | R/W | — | — | — | R/W |
| investors | R/W | — | — | — | — |
| investor_payouts | R/W | — | — | — | — |
| notifications | R/W | R (own) | R (own) | R (own) | R (own) |
| documents | R/W | R | R (own) | — | R/W |
| integrations | R/W | — | — | — | — |
| settings | R/W | R | R | R | R |
| audit_logs | R | — | — | — | — |

---

## Порядок создания таблиц (Migration Order)

```
1.  roles
2.  permissions
3.  departments
4.  employees             ← зависит от departments, auth.users
5.  schedules             ← зависит от employees
6.  attendance            ← зависит от employees
7.  kpi_templates
8.  employee_kpi          ← зависит от employees, kpi_templates
9.  consultations         ← зависит от employees
10. consultation_results  ← зависит от consultations
11. daily_facts           ← зависит от employees
12. decomposition         ← зависит от employees
13. finance_categories
14. finance_transactions  ← зависит от finance_categories, employees
15. finances
16. salaries              ← зависит от employees
17. salary_calculations   ← зависит от salaries
18. investors
19. investor_payouts      ← зависит от investors, finance_transactions
20. notifications         ← зависит от employees
21. documents             ← зависит от employees
22. integrations
23. settings
24. audit_logs            ← зависит от employees
```

---

*Этот документ является единственным источником истины для базы данных МОСТОВОЙ OS.*
*При расхождении между кодом и этим документом — документ имеет приоритет.*
*Следующий шаг: реализация миграций → реализация Dashboard по утверждённому дизайну.*

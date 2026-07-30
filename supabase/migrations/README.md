# Demi Results OS — Database Migrations

> Применять строго в порядке нумерации.
> Все миграции идемпотентны там, где это возможно (ON CONFLICT DO NOTHING).

## Порядок выполнения

| Файл | Содержимое | Зависимости |
|------|-----------|------------|
| `001_functions_core.sql` | Базовые функции: `set_updated_at`, `get_my_role`, `get_my_employee_id`, `get_my_department_id` | — |
| `002_roles_permissions.sql` | Таблицы `roles`, `permissions` + seed ролей | 001 |
| `003_departments.sql` | Таблица `departments` (без FK на employees) | 001 |
| `004_employees.sql` | Таблица `employees` + FK departments.manager_id | 001, 003 |
| `005_schedules_attendance.sql` | Таблицы `schedules`, `attendance` | 001, 004 |
| `006_kpi_templates_employee_kpi.sql` | Таблицы `kpi_templates`, `employee_kpi` + seed шаблонов | 001, 004 |
| `007_consultations.sql` | Таблицы `consultations`, `consultation_results` | 001, 004 |
| `008_daily_facts_decomposition.sql` | Таблицы `daily_facts`, `decomposition` | 001, 004 |
| `009_salaries.sql` | Таблицы `salaries`, `salary_calculations` | 001, 004 |
| `010_finances.sql` | Таблицы `finance_categories`, `finance_transactions`, `finances` + seed категорий | 001, 004 |
| `011_investors.sql` | Таблицы `investors`, `investor_payouts` | 001, 004, 010 |
| `012_notifications.sql` | Таблица `notifications` + Realtime | 001, 004 |
| `013_documents.sql` | Таблица `documents` + FK finance_transactions.document_id | 001, 004, 010 |
| `014_integrations_settings.sql` | Таблицы `integrations`, `settings` + seed | 001 |
| `015_audit_logs.sql` | Таблица `audit_logs` | 001, 004 |
| `016_functions_business.sql` | Бизнес-функции: `recalculate_decomposition`, `recalculate_finances`, `generate_monthly_schedule`, `calculate_salary` | 001–015 |
| `017_triggers_business.sql` | Триггеры: авто-пересчёт декомпозиции/финансов, авто-транзакции | 016 |
| `018_realtime.sql` | Realtime для `consultations`, `attendance`, `daily_facts` | 007, 005, 008 |
| `019_storage.sql` | Storage Buckets: `avatars`, `logos`, `documents` + RLS | 001, 004 |
| `020_seed_permissions.sql` | Матрица прав доступа по ролям | 002 |

## Как применить в Supabase

### Через Supabase CLI (рекомендуется)

```bash
# 1. Установить Supabase CLI
brew install supabase/tap/supabase

# 2. Связать проект
supabase link --project-ref rjzmxgiqleftwcsxgfte

# 3. Применить миграции
supabase db push
```

### Через Management API (SQL Editor)

Выполнить файлы по одному в порядке нумерации через
Supabase Dashboard → SQL Editor.

### Через Management API (curl)

```bash
for f in supabase/migrations/*.sql; do
  echo "Applying $f..."
  curl -s -X POST \
    "https://api.supabase.com/v1/projects/rjzmxgiqleftwcsxgfte/database/query" \
    -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"query\": $(cat $f | jq -Rs .)}" \
    | jq '.error // "OK"'
done
```

## После применения миграций

1. Включить Realtime в Supabase Dashboard → Database → Replication
   для таблиц: `consultations`, `notifications`, `attendance`, `daily_facts`

2. Создать первого пользователя (Владельца) через Supabase Auth → Users
   или через приложение (страница регистрации)

3. Добавить запись в `employees` с `role = 'owner'` и `user_id` из Auth

## Важные замечания

- Все таблицы имеют **RLS ENABLED** — без записи в `employees` ни один
  пользователь не увидит данные
- `settings` — singleton (одна строка), INSERT запрещён через RLS
- `audit_logs` — append-only (UPDATE/DELETE не разрешены)
- `finance_categories` с `is_system = true` нельзя удалить (CHECK в RLS)
- `departments.manager_id` FK добавлен в 004 (после создания employees)
- `finance_transactions.document_id` FK добавлен в 013 (после создания documents)

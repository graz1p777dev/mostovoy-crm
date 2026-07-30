# PROJECT_STATE.md — Demi Results OS CRM

> Обновлено: 2026-07-02 12:49 UTC
> Supabase Project: `rjzmxgiqleftwcsxgfte`

> **Изменения от последней версии:** удалена `consultation_results`; переименованы: `daily_facts`→`daily_activity`, `finances`→`finance_periods`, `decomposition`→`sales_plan_weekly`

---

## 1. Таблицы и колонки

> Всего таблиц: **23**

### `attendance`

| Колонка | Тип | Nullable | Default |
|---------|-----|----------|---------|
| `id` | UUID | NO | `gen_uuid()` |
| `employee_id` | UUID | NO | `—` |
| `date` | DATE | NO | `—` |
| `status` | TEXT | NO | `—` |
| `comment` | TEXT | YES | `—` |
| `marked_by` | UUID | YES | `—` |
| `created_at` | TIMESTAMPTZ | NO | `NOW()` |
| `updated_at` | TIMESTAMPTZ | NO | `NOW()` |

### `audit_logs`

| Колонка | Тип | Nullable | Default |
|---------|-----|----------|---------|
| `id` | UUID | NO | `gen_uuid()` |
| `employee_id` | UUID | YES | `—` |
| `action` | TEXT | NO | `—` |
| `resource_type` | TEXT | NO | `—` |
| `resource_id` | UUID | YES | `—` |
| `old_data` | JSONB | YES | `—` |
| `new_data` | JSONB | YES | `—` |
| `ip_address` | INET | YES | `—` |
| `user_agent` | TEXT | YES | `—` |
| `created_at` | TIMESTAMPTZ | NO | `NOW()` |

### `consultations`

| Колонка | Тип | Nullable | Default |
|---------|-----|----------|---------|
| `id` | UUID | NO | `gen_uuid()` |
| `manager_id` | UUID | YES | `—` |
| `recorded_by_id` | UUID | YES | `—` |
| `date` | DATE | NO | `—` |
| `time` | TIME | YES | `—` |
| `client_name` | VARCHAR | NO | `—` |
| `phone` | VARCHAR | YES | `—` |
| `deal_number` | VARCHAR | YES | `—` |
| `format` | TEXT | YES | `—` |
| `recorded_by` | VARCHAR | YES | `—` |
| `status` | TEXT | YES | `—` |
| `actual_status` | TEXT | YES | `—` |
| `status_after_fv` | TEXT | YES | `—` |
| `amount` | NUMERIC | NO | `0` |
| `delivery_cost` | NUMERIC | NO | `0` |
| `is_nv` | BOOLEAN | NO | `false` |
| `comment` | TEXT | YES | `—` |
| `deleted_at` | TIMESTAMPTZ | YES | `—` |
| `created_at` | TIMESTAMPTZ | NO | `NOW()` |
| `updated_at` | TIMESTAMPTZ | NO | `NOW()` |
| `alb_status` | TEXT | YES | `—` |
| `consulting_doctor` | TEXT | YES | `—` |

### `daily_activity` *(переименована из `daily_facts`)*

| Колонка | Тип | Nullable | Default |
|---------|-----|----------|---------|
| `id` | UUID | NO | `gen_uuid()` |
| `employee_id` | UUID | NO | `—` |
| `date` | DATE | NO | `—` |
| `fv_fact` | INTEGER | YES | `—` |
| `sales_fact` | INTEGER | YES | `—` |
| `revenue_fact` | NUMERIC | YES | `—` |
| `nv_fact` | INTEGER | YES | `—` |
| `nv_sales_fact` | INTEGER | YES | `—` |
| `nv_revenue_fact` | NUMERIC | YES | `—` |
| `appeals_fact` | INTEGER | YES | `—` |
| `leads_fact` | INTEGER | YES | `—` |
| `notes` | TEXT | YES | `—` |
| `created_by` | UUID | YES | `—` |
| `created_at` | TIMESTAMPTZ | NO | `NOW()` |
| `updated_at` | TIMESTAMPTZ | NO | `NOW()` |

### `departments`

| Колонка | Тип | Nullable | Default |
|---------|-----|----------|---------|
| `id` | UUID | NO | `gen_uuid()` |
| `name` | VARCHAR | NO | `—` |
| `description` | TEXT | YES | `—` |
| `manager_id` | UUID | YES | `—` |
| `is_active` | BOOLEAN | NO | `true` |
| `created_at` | TIMESTAMPTZ | NO | `NOW()` |
| `updated_at` | TIMESTAMPTZ | NO | `NOW()` |

### `documents`

| Колонка | Тип | Nullable | Default |
|---------|-----|----------|---------|
| `id` | UUID | NO | `gen_uuid()` |
| `name` | VARCHAR | NO | `—` |
| `original_name` | VARCHAR | NO | `—` |
| `category` | TEXT | NO | `'other'::text` |
| `storage_path` | TEXT | NO | `—` |
| `mime_type` | VARCHAR | YES | `—` |
| `size_bytes` | BIGINT | YES | `—` |
| `uploaded_by` | UUID | YES | `—` |
| `related_type` | TEXT | YES | `—` |
| `related_id` | UUID | YES | `—` |
| `is_generated` | BOOLEAN | NO | `false` |
| `deleted_at` | TIMESTAMPTZ | YES | `—` |
| `created_at` | TIMESTAMPTZ | NO | `NOW()` |
| `updated_at` | TIMESTAMPTZ | NO | `NOW()` |

### `employee_kpi`

| Колонка | Тип | Nullable | Default |
|---------|-----|----------|---------|
| `id` | UUID | NO | `gen_uuid()` |
| `employee_id` | UUID | NO | `—` |
| `period_year` | SMALLINT | NO | `—` |
| `period_month` | SMALLINT | NO | `—` |
| `kpi_template_id` | UUID | YES | `—` |
| `plan_fv` | INTEGER | YES | `—` |
| `plan_sales` | INTEGER | YES | `—` |
| `plan_revenue` | NUMERIC | YES | `—` |
| `plan_appeals` | INTEGER | YES | `—` |
| `plan_leads` | INTEGER | YES | `—` |
| `plan_nv` | INTEGER | YES | `—` |
| `plan_work_days` | SMALLINT | YES | `—` |
| `notes` | TEXT | YES | `—` |
| `created_by` | UUID | YES | `—` |
| `created_at` | TIMESTAMPTZ | NO | `NOW()` |
| `updated_at` | TIMESTAMPTZ | NO | `NOW()` |

### `employees`

| Колонка | Тип | Nullable | Default |
|---------|-----|----------|---------|
| `id` | UUID | NO | `gen_uuid()` |
| `user_id` | UUID | YES | `—` |
| `department_id` | UUID | YES | `—` |
| `name` | VARCHAR | NO | `—` |
| `phone` | VARCHAR | YES | `—` |
| `email` | VARCHAR | NO | `—` |
| `role` | TEXT | NO | `'mp'::text` |
| `avatar_url` | TEXT | YES | `—` |
| `hire_date` | DATE | YES | `—` |
| `birth_date` | DATE | YES | `—` |
| `base_salary` | NUMERIC | NO | `0` |
| `kpi_coefficient` | NUMERIC | NO | `1.0` |
| `schedule_type` | TEXT | NO | `'5/2'::text` |
| `work_start_time` | TIME | YES | `'09:00:00'::time without time zone` |
| `work_end_time` | TIME | YES | `'18:00:00'::time without time zone` |
| `status` | TEXT | NO | `'active'::text` |
| `notes` | TEXT | YES | `—` |
| `deleted_at` | TIMESTAMPTZ | YES | `—` |
| `created_at` | TIMESTAMPTZ | NO | `NOW()` |
| `updated_at` | TIMESTAMPTZ | NO | `NOW()` |

### `finance_categories`

| Колонка | Тип | Nullable | Default |
|---------|-----|----------|---------|
| `id` | UUID | NO | `gen_uuid()` |
| `name` | VARCHAR | NO | `—` |
| `type` | TEXT | NO | `—` |
| `color` | VARCHAR | YES | `'#6b7280'::character varying` |
| `icon` | VARCHAR | YES | `—` |
| `is_system` | BOOLEAN | NO | `false` |
| `is_active` | BOOLEAN | NO | `true` |
| `created_at` | TIMESTAMPTZ | NO | `NOW()` |
| `updated_at` | TIMESTAMPTZ | NO | `NOW()` |

### `finance_periods` *(переименована из `finances`)*

| Колонка | Тип | Nullable | Default |
|---------|-----|----------|---------|
| `id` | UUID | NO | `gen_uuid()` |
| `period_year` | SMALLINT | NO | `—` |
| `period_month` | SMALLINT | NO | `—` |
| `total_income` | NUMERIC | NO | `0` |
| `total_expense` | NUMERIC | NO | `0` |
| `net_profit` | NUMERIC | NO | `0` |
| `margin_pct` | NUMERIC | NO | `0` |
| `last_calculated_at` | TIMESTAMPTZ | YES | `—` |
| `created_at` | TIMESTAMPTZ | NO | `NOW()` |
| `updated_at` | TIMESTAMPTZ | NO | `NOW()` |

### `finance_transactions`

| Колонка | Тип | Nullable | Default |
|---------|-----|----------|---------|
| `id` | UUID | NO | `gen_uuid()` |
| `category_id` | UUID | NO | `—` |
| `type` | TEXT | NO | `—` |
| `amount` | NUMERIC | NO | `—` |
| `date` | DATE | NO | `—` |
| `description` | TEXT | YES | `—` |
| `source_type` | TEXT | YES | `—` |
| `source_id` | UUID | YES | `—` |
| `created_by` | UUID | YES | `—` |
| `document_id` | UUID | YES | `—` |
| `deleted_at` | TIMESTAMPTZ | YES | `—` |
| `created_at` | TIMESTAMPTZ | NO | `NOW()` |
| `updated_at` | TIMESTAMPTZ | NO | `NOW()` |

### `integrations`

| Колонка | Тип | Nullable | Default |
|---------|-----|----------|---------|
| `id` | UUID | NO | `gen_uuid()` |
| `name` | VARCHAR | NO | `—` |
| `type` | TEXT | NO | `—` |
| `is_active` | BOOLEAN | NO | `false` |
| `config` | JSONB | YES | `—` |
| `last_sync_at` | TIMESTAMPTZ | YES | `—` |
| `last_sync_status` | TEXT | YES | `—` |
| `last_sync_error` | TEXT | YES | `—` |
| `webhook_url` | TEXT | YES | `—` |
| `created_at` | TIMESTAMPTZ | NO | `NOW()` |
| `updated_at` | TIMESTAMPTZ | NO | `NOW()` |

### `investor_payouts`

| Колонка | Тип | Nullable | Default |
|---------|-----|----------|---------|
| `id` | UUID | NO | `gen_uuid()` |
| `investor_id` | UUID | NO | `—` |
| `amount` | NUMERIC | NO | `—` |
| `date` | DATE | NO | `—` |
| `type` | TEXT | NO | `'dividend'::text` |
| `description` | TEXT | YES | `—` |
| `transaction_id` | UUID | YES | `—` |
| `created_by` | UUID | YES | `—` |
| `created_at` | TIMESTAMPTZ | NO | `NOW()` |
| `updated_at` | TIMESTAMPTZ | NO | `NOW()` |

### `investors`

| Колонка | Тип | Nullable | Default |
|---------|-----|----------|---------|
| `id` | UUID | NO | `gen_uuid()` |
| `name` | VARCHAR | NO | `—` |
| `phone` | VARCHAR | YES | `—` |
| `email` | VARCHAR | YES | `—` |
| `share_pct` | NUMERIC | NO | `0` |
| `investment_amount` | NUMERIC | NO | `0` |
| `investment_date` | DATE | YES | `—` |
| `is_active` | BOOLEAN | NO | `true` |
| `notes` | TEXT | YES | `—` |
| `created_at` | TIMESTAMPTZ | NO | `NOW()` |
| `updated_at` | TIMESTAMPTZ | NO | `NOW()` |

### `kpi_templates`

| Колонка | Тип | Nullable | Default |
|---------|-----|----------|---------|
| `id` | UUID | NO | `gen_uuid()` |
| `role` | TEXT | NO | `—` |
| `name` | VARCHAR | NO | `—` |
| `is_default` | BOOLEAN | NO | `false` |
| `metrics` | JSONB | NO | `'{}'::jsonb` |
| `min_threshold_pct` | NUMERIC | NO | `30.0` |
| `over_plan_coefficient` | NUMERIC | NO | `1.2` |
| `created_at` | TIMESTAMPTZ | NO | `NOW()` |
| `updated_at` | TIMESTAMPTZ | NO | `NOW()` |

### `notifications`

| Колонка | Тип | Nullable | Default |
|---------|-----|----------|---------|
| `id` | UUID | NO | `gen_uuid()` |
| `employee_id` | UUID | NO | `—` |
| `type` | TEXT | NO | `—` |
| `title` | VARCHAR | NO | `—` |
| `body` | TEXT | YES | `—` |
| `action_url` | TEXT | YES | `—` |
| `is_read` | BOOLEAN | NO | `false` |
| `is_important` | BOOLEAN | NO | `false` |
| `source_type` | TEXT | YES | `—` |
| `source_id` | UUID | YES | `—` |
| `expires_at` | TIMESTAMPTZ | YES | `—` |
| `created_at` | TIMESTAMPTZ | NO | `NOW()` |

### `permissions`

| Колонка | Тип | Nullable | Default |
|---------|-----|----------|---------|
| `id` | UUID | NO | `gen_uuid()` |
| `role_id` | UUID | NO | `—` |
| `resource` | VARCHAR | NO | `—` |
| `can_view` | BOOLEAN | NO | `false` |
| `can_create` | BOOLEAN | NO | `false` |
| `can_edit` | BOOLEAN | NO | `false` |
| `can_delete` | BOOLEAN | NO | `false` |
| `scope` | TEXT | NO | `'own'::text` |
| `created_at` | TIMESTAMPTZ | NO | `NOW()` |
| `updated_at` | TIMESTAMPTZ | NO | `NOW()` |

### `roles`

| Колонка | Тип | Nullable | Default |
|---------|-----|----------|---------|
| `id` | UUID | NO | `gen_uuid()` |
| `name` | VARCHAR | NO | `—` |
| `label` | VARCHAR | NO | `—` |
| `description` | TEXT | YES | `—` |
| `is_system` | BOOLEAN | NO | `false` |
| `created_at` | TIMESTAMPTZ | NO | `NOW()` |
| `updated_at` | TIMESTAMPTZ | NO | `NOW()` |

### `salaries`

| Колонка | Тип | Nullable | Default |
|---------|-----|----------|---------|
| `id` | UUID | NO | `gen_uuid()` |
| `employee_id` | UUID | NO | `—` |
| `period_year` | SMALLINT | NO | `—` |
| `period_month` | SMALLINT | NO | `—` |
| `base_salary` | NUMERIC | NO | `0` |
| `kpi_bonus` | NUMERIC | NO | `0` |
| `bonuses` | NUMERIC | NO | `0` |
| `deductions` | NUMERIC | NO | `0` |
| `total_amount` | NUMERIC | NO | `0` |
| `kpi_pct` | NUMERIC | NO | `0` |
| `work_days_fact` | SMALLINT | NO | `0` |
| `work_days_plan` | SMALLINT | NO | `0` |
| `status` | TEXT | NO | `'draft'::text` |
| `paid_at` | TIMESTAMPTZ | YES | `—` |
| `paid_by` | UUID | YES | `—` |
| `notes` | TEXT | YES | `—` |
| `calculated_at` | TIMESTAMPTZ | YES | `—` |
| `created_at` | TIMESTAMPTZ | NO | `NOW()` |
| `updated_at` | TIMESTAMPTZ | NO | `NOW()` |

### `salary_calculations`

| Колонка | Тип | Nullable | Default |
|---------|-----|----------|---------|
| `id` | UUID | NO | `gen_uuid()` |
| `salary_id` | UUID | NO | `—` |
| `type` | TEXT | NO | `—` |
| `description` | VARCHAR | NO | `—` |
| `amount` | NUMERIC | NO | `—` |
| `metric_name` | VARCHAR | YES | `—` |
| `metric_plan` | NUMERIC | YES | `—` |
| `metric_fact` | NUMERIC | YES | `—` |
| `metric_pct` | NUMERIC | YES | `—` |
| `weight` | NUMERIC | YES | `—` |
| `created_at` | TIMESTAMPTZ | NO | `NOW()` |

### `sales_plan_weekly` *(переименована из `decomposition`)*

| Колонка | Тип | Nullable | Default |
|---------|-----|----------|---------|
| `id` | UUID | NO | `gen_uuid()` |
| `employee_id` | UUID | NO | `—` |
| `period_year` | SMALLINT | NO | `—` |
| `period_month` | SMALLINT | NO | `—` |
| `total_fv_plan` | INTEGER | NO | `0` |
| `total_fv_fact` | INTEGER | NO | `0` |
| `total_sales_plan` | INTEGER | NO | `0` |
| `total_sales_fact` | INTEGER | NO | `0` |
| `total_revenue_plan` | NUMERIC | NO | `0` |
| `total_revenue_fact` | NUMERIC | NO | `0` |
| `total_work_days_plan` | SMALLINT | NO | `0` |
| `total_work_days_fact` | SMALLINT | NO | `0` |
| `kpi_pct` | NUMERIC | NO | `0` |
| `last_calculated_at` | TIMESTAMPTZ | YES | `—` |
| `created_at` | TIMESTAMPTZ | NO | `NOW()` |
| `updated_at` | TIMESTAMPTZ | NO | `NOW()` |

### `schedules`

| Колонка | Тип | Nullable | Default |
|---------|-----|----------|---------|
| `id` | UUID | NO | `gen_uuid()` |
| `employee_id` | UUID | NO | `—` |
| `date` | DATE | NO | `—` |
| `is_workday` | BOOLEAN | NO | `true` |
| `work_start` | TIME | YES | `—` |
| `work_end` | TIME | YES | `—` |
| `note` | TEXT | YES | `—` |
| `created_at` | TIMESTAMPTZ | NO | `NOW()` |
| `updated_at` | TIMESTAMPTZ | NO | `NOW()` |

### `settings`

| Колонка | Тип | Nullable | Default |
|---------|-----|----------|---------|
| `id` | UUID | NO | `gen_uuid()` |
| `company_name` | VARCHAR | NO | `'Demi Results'::character varying` |
| `logo_url` | TEXT | YES | `—` |
| `timezone` | VARCHAR | NO | `'Asia/Bishkek'::character varying` |
| `currency` | VARCHAR | NO | `'KGS'::character varying` |
| `week_start_day` | SMALLINT | NO | `1` |
| `month_start_day` | SMALLINT | NO | `1` |
| `salary_close_day` | SMALLINT | NO | `25` |
| `salary_pay_day` | SMALLINT | NO | `5` |
| `default_work_start` | TIME | NO | `'09:00:00'::time without time zone` |
| `default_work_end` | TIME | NO | `'18:00:00'::time without time zone` |
| `absence_alert_time` | TIME | NO | `'12:00:00'::time without time zone` |
| `kpi_alert_threshold` | NUMERIC | NO | `30.0` |
| `theme` | TEXT | NO | `'light'::text` |
| `language` | VARCHAR | NO | `'ru'::character varying` |
| `extra` | JSONB | YES | `'{}'::jsonb` |
| `created_at` | TIMESTAMPTZ | NO | `NOW()` |
| `updated_at` | TIMESTAMPTZ | NO | `NOW()` |

---

## 2. RLS-политики

> Всего политик: **107** по **23** таблицам

### `attendance` (5 политик)

| Политика | Команда | Условие (USING) | WITH CHECK |
|----------|---------|-----------------|------------|
| `attendance_delete_owner` | DELETE | `(get_my_role() = 'owner'::text)` | `—` |
| `attendance_insert_owner_rop` | INSERT | `—` | `(get_my_role() = ANY (ARRAY['owner'::text, 'rop'::text]))` |
| `attendance_select_owner_rop_accountant` | SELECT | `(get_my_role() = ANY (ARRAY['owner'::text, 'rop'::text, 'accountant'::text]))` | `—` |
| `attendance_select_self` | SELECT | `((get_my_role() = ANY (ARRAY['mp'::text, 'lmai'::text])) AND (employee_id = g...` | `—` |
| `attendance_update_owner_rop` | UPDATE | `(get_my_role() = ANY (ARRAY['owner'::text, 'rop'::text]))` | `—` |

### `audit_logs` (2 политик)

| Политика | Команда | Условие (USING) | WITH CHECK |
|----------|---------|-----------------|------------|
| `audit_logs_insert_authenticated` | INSERT | `—` | `true` |
| `audit_logs_select_owner` | SELECT | `(get_my_role() = 'owner'::text)` | `—` |

### `consultations` (7 политик)

| Политика | Команда | Условие (USING) | WITH CHECK |
|----------|---------|-----------------|------------|
| `consultations_delete_owner_rop` | DELETE | `(get_my_role() = ANY (ARRAY['owner'::text, 'rop'::text]))` | `—` |
| `consultations_delete_self` | DELETE | `((get_my_role() = ANY (ARRAY['mp'::text, 'lmai'::text])) AND (manager_id = ge...` | `—` |
| `consultations_insert_staff` | INSERT | `—` | `(get_my_role() = ANY (ARRAY['owner'::text, 'rop'::text, 'mp'::text, 'lmai'::t...` |
| `consultations_select_owner_rop` | SELECT | `((get_my_role() = ANY (ARRAY['owner'::text, 'rop'::text])) AND (deleted_at IS...` | `—` |
| `consultations_select_self` | SELECT | `((get_my_role() = ANY (ARRAY['mp'::text, 'lmai'::text])) AND (manager_id = ge...` | `—` |
| `consultations_update_owner_rop` | UPDATE | `((get_my_role() = ANY (ARRAY['owner'::text, 'rop'::text])) AND (deleted_at IS...` | `—` |
| `consultations_update_self` | UPDATE | `((get_my_role() = ANY (ARRAY['mp'::text, 'lmai'::text])) AND (manager_id = ge...` | `—` |

### `daily_activity` (7 политик)

| Политика | Команда | Условие (USING) | WITH CHECK |
|----------|---------|-----------------|------------|
| `daily_facts_delete_owner` | DELETE | `(get_my_role() = 'owner'::text)` | `—` |
| `daily_facts_insert_owner_rop` | INSERT | `—` | `(get_my_role() = ANY (ARRAY['owner'::text, 'rop'::text]))` |
| `daily_facts_insert_self` | INSERT | `—` | `((get_my_role() = ANY (ARRAY['mp'::text, 'lmai'::text])) AND (employee_id = g...` |
| `daily_facts_select_owner_rop` | SELECT | `(get_my_role() = ANY (ARRAY['owner'::text, 'rop'::text]))` | `—` |
| `daily_facts_select_self` | SELECT | `((get_my_role() = ANY (ARRAY['mp'::text, 'lmai'::text])) AND (employee_id = g...` | `—` |
| `daily_facts_update_owner_rop` | UPDATE | `(get_my_role() = ANY (ARRAY['owner'::text, 'rop'::text]))` | `—` |
| `daily_facts_update_self` | UPDATE | `((get_my_role() = ANY (ARRAY['mp'::text, 'lmai'::text])) AND (employee_id = g...` | `—` |

### `departments` (4 политик)

| Политика | Команда | Условие (USING) | WITH CHECK |
|----------|---------|-----------------|------------|
| `departments_delete_owner` | DELETE | `(get_my_role() = 'owner'::text)` | `—` |
| `departments_insert_owner` | INSERT | `—` | `(get_my_role() = 'owner'::text)` |
| `departments_select_authenticated` | SELECT | `true` | `—` |
| `departments_update_owner` | UPDATE | `(get_my_role() = 'owner'::text)` | `—` |

### `documents` (5 политик)

| Политика | Команда | Условие (USING) | WITH CHECK |
|----------|---------|-----------------|------------|
| `documents_delete_owner` | DELETE | `(get_my_role() = 'owner'::text)` | `—` |
| `documents_insert_owner_accountant` | INSERT | `—` | `(get_my_role() = ANY (ARRAY['owner'::text, 'accountant'::text]))` |
| `documents_select_owner_accountant_rop` | SELECT | `((get_my_role() = ANY (ARRAY['owner'::text, 'accountant'::text, 'rop'::text])...` | `—` |
| `documents_select_self` | SELECT | `((get_my_role() = ANY (ARRAY['mp'::text, 'lmai'::text])) AND (uploaded_by = g...` | `—` |
| `documents_update_owner_accountant` | UPDATE | `(get_my_role() = ANY (ARRAY['owner'::text, 'accountant'::text]))` | `—` |

### `employee_kpi` (5 политик)

| Политика | Команда | Условие (USING) | WITH CHECK |
|----------|---------|-----------------|------------|
| `employee_kpi_delete_owner` | DELETE | `(get_my_role() = 'owner'::text)` | `—` |
| `employee_kpi_insert_owner_rop` | INSERT | `—` | `(get_my_role() = ANY (ARRAY['owner'::text, 'rop'::text]))` |
| `employee_kpi_select_owner_rop` | SELECT | `(get_my_role() = ANY (ARRAY['owner'::text, 'rop'::text, 'accountant'::text]))` | `—` |
| `employee_kpi_select_self` | SELECT | `((get_my_role() = ANY (ARRAY['mp'::text, 'lmai'::text])) AND (employee_id = g...` | `—` |
| `employee_kpi_update_owner_rop` | UPDATE | `(get_my_role() = ANY (ARRAY['owner'::text, 'rop'::text]))` | `—` |

### `employees` (7 политик)

| Политика | Команда | Условие (USING) | WITH CHECK |
|----------|---------|-----------------|------------|
| `employees_delete_owner` | DELETE | `(get_my_role() = 'owner'::text)` | `—` |
| `employees_insert_owner` | INSERT | `—` | `(get_my_role() = 'owner'::text)` |
| `employees_select_owner_accountant` | SELECT | `((get_my_role() = ANY (ARRAY['owner'::text, 'accountant'::text])) AND (delete...` | `—` |
| `employees_select_rop` | SELECT | `((get_my_role() = 'rop'::text) AND (deleted_at IS NULL) AND ((department_id =...` | `—` |
| `employees_select_self` | SELECT | `((get_my_role() = ANY (ARRAY['mp'::text, 'lmai'::text])) AND (user_id = auth....` | `—` |
| `employees_update_owner` | UPDATE | `(get_my_role() = 'owner'::text)` | `—` |
| `employees_update_self_limited` | UPDATE | `((get_my_role() = ANY (ARRAY['mp'::text, 'lmai'::text])) AND (user_id = auth....` | `—` |

### `finance_categories` (4 политик)

| Политика | Команда | Условие (USING) | WITH CHECK |
|----------|---------|-----------------|------------|
| `finance_cat_delete_owner_accountant` | DELETE | `((get_my_role() = ANY (ARRAY['owner'::text, 'accountant'::text])) AND (is_sys...` | `—` |
| `finance_cat_insert_owner_accountant` | INSERT | `—` | `(get_my_role() = ANY (ARRAY['owner'::text, 'accountant'::text]))` |
| `finance_cat_select_owner_accountant_rop` | SELECT | `(get_my_role() = ANY (ARRAY['owner'::text, 'accountant'::text, 'rop'::text]))` | `—` |
| `finance_cat_update_owner_accountant` | UPDATE | `(get_my_role() = ANY (ARRAY['owner'::text, 'accountant'::text]))` | `—` |

### `finance_periods` (3 политик)

| Политика | Команда | Условие (USING) | WITH CHECK |
|----------|---------|-----------------|------------|
| `finances_insert_owner_accountant` | INSERT | `—` | `(get_my_role() = ANY (ARRAY['owner'::text, 'accountant'::text]))` |
| `finances_select_owner_accountant` | SELECT | `(get_my_role() = ANY (ARRAY['owner'::text, 'accountant'::text]))` | `—` |
| `finances_update_owner_accountant` | UPDATE | `(get_my_role() = ANY (ARRAY['owner'::text, 'accountant'::text]))` | `—` |

### `finance_transactions` (4 политик)

| Политика | Команда | Условие (USING) | WITH CHECK |
|----------|---------|-----------------|------------|
| `fin_trans_delete_owner` | DELETE | `(get_my_role() = 'owner'::text)` | `—` |
| `fin_trans_insert_owner_accountant` | INSERT | `—` | `(get_my_role() = ANY (ARRAY['owner'::text, 'accountant'::text]))` |
| `fin_trans_select_owner_accountant` | SELECT | `((get_my_role() = ANY (ARRAY['owner'::text, 'accountant'::text])) AND (delete...` | `—` |
| `fin_trans_update_owner_accountant` | UPDATE | `(get_my_role() = ANY (ARRAY['owner'::text, 'accountant'::text]))` | `—` |

### `integrations` (4 политик)

| Политика | Команда | Условие (USING) | WITH CHECK |
|----------|---------|-----------------|------------|
| `integrations_delete_owner` | DELETE | `(get_my_role() = 'owner'::text)` | `—` |
| `integrations_insert_owner` | INSERT | `—` | `(get_my_role() = 'owner'::text)` |
| `integrations_select_owner` | SELECT | `(get_my_role() = 'owner'::text)` | `—` |
| `integrations_update_owner` | UPDATE | `(get_my_role() = 'owner'::text)` | `—` |

### `investor_payouts` (4 политик)

| Политика | Команда | Условие (USING) | WITH CHECK |
|----------|---------|-----------------|------------|
| `investor_payouts_delete_owner` | DELETE | `(get_my_role() = 'owner'::text)` | `—` |
| `investor_payouts_insert_owner` | INSERT | `—` | `(get_my_role() = 'owner'::text)` |
| `investor_payouts_select_owner` | SELECT | `(get_my_role() = 'owner'::text)` | `—` |
| `investor_payouts_update_owner` | UPDATE | `(get_my_role() = 'owner'::text)` | `—` |

### `investors` (4 политик)

| Политика | Команда | Условие (USING) | WITH CHECK |
|----------|---------|-----------------|------------|
| `investors_delete_owner` | DELETE | `(get_my_role() = 'owner'::text)` | `—` |
| `investors_insert_owner` | INSERT | `—` | `(get_my_role() = 'owner'::text)` |
| `investors_select_owner` | SELECT | `(get_my_role() = 'owner'::text)` | `—` |
| `investors_update_owner` | UPDATE | `(get_my_role() = 'owner'::text)` | `—` |

### `kpi_templates` (4 политик)

| Политика | Команда | Условие (USING) | WITH CHECK |
|----------|---------|-----------------|------------|
| `kpi_templates_delete_owner` | DELETE | `(get_my_role() = 'owner'::text)` | `—` |
| `kpi_templates_insert_owner` | INSERT | `—` | `(get_my_role() = 'owner'::text)` |
| `kpi_templates_select_authenticated` | SELECT | `true` | `—` |
| `kpi_templates_update_owner` | UPDATE | `(get_my_role() = 'owner'::text)` | `—` |

### `notifications` (6 политик)

| Политика | Команда | Условие (USING) | WITH CHECK |
|----------|---------|-----------------|------------|
| `notifications_delete_owner` | DELETE | `(get_my_role() = 'owner'::text)` | `—` |
| `notifications_insert_owner` | INSERT | `—` | `(get_my_role() = 'owner'::text)` |
| `notifications_select_owner` | SELECT | `(get_my_role() = 'owner'::text)` | `—` |
| `notifications_select_self` | SELECT | `(employee_id = get_my_employee_id())` | `—` |
| `notifications_update_owner` | UPDATE | `(get_my_role() = 'owner'::text)` | `—` |
| `notifications_update_read_self` | UPDATE | `(employee_id = get_my_employee_id())` | `—` |

### `permissions` (4 политик)

| Политика | Команда | Условие (USING) | WITH CHECK |
|----------|---------|-----------------|------------|
| `permissions_delete_owner` | DELETE | `(get_my_role() = 'owner'::text)` | `—` |
| `permissions_insert_owner` | INSERT | `—` | `(get_my_role() = 'owner'::text)` |
| `permissions_select_authenticated` | SELECT | `true` | `—` |
| `permissions_update_owner` | UPDATE | `(get_my_role() = 'owner'::text)` | `—` |

### `roles` (4 политик)

| Политика | Команда | Условие (USING) | WITH CHECK |
|----------|---------|-----------------|------------|
| `roles_delete_owner` | DELETE | `(get_my_role() = 'owner'::text)` | `—` |
| `roles_insert_owner` | INSERT | `—` | `(get_my_role() = 'owner'::text)` |
| `roles_select_authenticated` | SELECT | `true` | `—` |
| `roles_update_owner` | UPDATE | `(get_my_role() = 'owner'::text)` | `—` |

### `salaries` (6 политик)

| Политика | Команда | Условие (USING) | WITH CHECK |
|----------|---------|-----------------|------------|
| `salaries_delete_owner` | DELETE | `(get_my_role() = 'owner'::text)` | `—` |
| `salaries_insert_owner_accountant` | INSERT | `—` | `(get_my_role() = ANY (ARRAY['owner'::text, 'accountant'::text]))` |
| `salaries_select_owner_accountant` | SELECT | `(get_my_role() = ANY (ARRAY['owner'::text, 'accountant'::text]))` | `—` |
| `salaries_select_rop` | SELECT | `((get_my_role() = 'rop'::text) AND (EXISTS ( SELECT 1    FROM employees e   W...` | `—` |
| `salaries_select_self` | SELECT | `((get_my_role() = ANY (ARRAY['mp'::text, 'lmai'::text])) AND (employee_id = g...` | `—` |
| `salaries_update_owner_accountant` | UPDATE | `(get_my_role() = ANY (ARRAY['owner'::text, 'accountant'::text]))` | `—` |

### `salary_calculations` (6 политик)

| Политика | Команда | Условие (USING) | WITH CHECK |
|----------|---------|-----------------|------------|
| `salary_calc_delete_owner` | DELETE | `(get_my_role() = 'owner'::text)` | `—` |
| `salary_calc_insert_owner_accountant` | INSERT | `—` | `(get_my_role() = ANY (ARRAY['owner'::text, 'accountant'::text]))` |
| `salary_calc_select_owner_accountant` | SELECT | `(get_my_role() = ANY (ARRAY['owner'::text, 'accountant'::text]))` | `—` |
| `salary_calc_select_rop` | SELECT | `((get_my_role() = 'rop'::text) AND (EXISTS ( SELECT 1    FROM (salaries s    ...` | `—` |
| `salary_calc_select_self` | SELECT | `((get_my_role() = ANY (ARRAY['mp'::text, 'lmai'::text])) AND (EXISTS ( SELECT...` | `—` |
| `salary_calc_update_owner_accountant` | UPDATE | `(get_my_role() = ANY (ARRAY['owner'::text, 'accountant'::text]))` | `—` |

### `sales_plan_weekly` (5 политик)

| Политика | Команда | Условие (USING) | WITH CHECK |
|----------|---------|-----------------|------------|
| `decomposition_delete_owner` | DELETE | `(get_my_role() = 'owner'::text)` | `—` |
| `decomposition_insert_system` | INSERT | `—` | `(get_my_role() = ANY (ARRAY['owner'::text, 'rop'::text]))` |
| `decomposition_select_owner_rop` | SELECT | `(get_my_role() = ANY (ARRAY['owner'::text, 'rop'::text]))` | `—` |
| `decomposition_select_self` | SELECT | `((get_my_role() = ANY (ARRAY['mp'::text, 'lmai'::text])) AND (employee_id = g...` | `—` |
| `decomposition_update_system` | UPDATE | `(get_my_role() = ANY (ARRAY['owner'::text, 'rop'::text]))` | `—` |

### `schedules` (5 политик)

| Политика | Команда | Условие (USING) | WITH CHECK |
|----------|---------|-----------------|------------|
| `schedules_delete_owner_rop` | DELETE | `(get_my_role() = ANY (ARRAY['owner'::text, 'rop'::text]))` | `—` |
| `schedules_insert_owner_rop` | INSERT | `—` | `(get_my_role() = ANY (ARRAY['owner'::text, 'rop'::text]))` |
| `schedules_select_owner_rop` | SELECT | `(get_my_role() = ANY (ARRAY['owner'::text, 'rop'::text]))` | `—` |
| `schedules_select_self` | SELECT | `((get_my_role() = ANY (ARRAY['mp'::text, 'lmai'::text])) AND (employee_id = g...` | `—` |
| `schedules_update_owner_rop` | UPDATE | `(get_my_role() = ANY (ARRAY['owner'::text, 'rop'::text]))` | `—` |

### `settings` (2 политик)

| Политика | Команда | Условие (USING) | WITH CHECK |
|----------|---------|-----------------|------------|
| `settings_select_authenticated` | SELECT | `true` | `—` |
| `settings_update_owner` | UPDATE | `(get_my_role() = 'owner'::text)` | `—` |

---

## 3. Пользователи

> Всего пользователей: **1** (только владелец)

| Email | Имя | Роль | Статус | Создан | Последний вход |
|-------|-----|------|--------|--------|----------------|
| bacer.espire@gmail.com | Самат (Владелец) | owner | active | 2026-06-20 | 2026-07-01 |

---

## 4. Переименования и удаления (от предыдущей версии)

| Действие | Было | Стало |
|----------|------|-------|
| Удалена | `consultation_results` | — |
| Переименована | `daily_facts` | `daily_activity` |
| Переименована | `finances` | `finance_periods` |
| Переименована | `decomposition` | `sales_plan_weekly` |

**Обновлены функции БД:** `recalculate_decomposition`, `calculate_salary`, `trigger_recalc_decomposition`, `recalculate_finances`

**Обновлены файлы кода:**
- `src/app/dashboard/employees/[id]/page.tsx`
- `src/app/dashboard/salary/page.tsx`
- `src/lib/dashboard-queries.ts`
- `src/lib/data/adapters/employees/SupabaseEmployeesAdapter.ts`

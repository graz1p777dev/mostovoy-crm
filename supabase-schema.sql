-- ============================================================
-- CRM System Database Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- Users extended profile (Supabase Auth handles auth itself)
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null,
  name text not null,
  role text not null check (role in ('owner', 'manager', 'employee')),
  created_at timestamptz default now()
);

-- Employees (extends profiles with business data)
create table if not exists public.employees (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete set null,
  name text not null,
  role_type text not null check (role_type in ('МП', 'ЛМ', 'Косметолог', 'РОП')),
  salary_base numeric default 0,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Consultations (appointments)
create table if not exists public.consultations (
  id uuid default gen_random_uuid() primary key,
  date date not null,
  time time not null,
  client_name text,
  format text check (format in ('Онлайн', 'Офлайн')),
  phone text,
  deal_number text,
  recorded_by text,
  status text check (status in ('Записан', 'Пришел', 'Не пришел', 'Перенес', 'Отказ', 'Продажа')),
  actual_status text check (actual_status in ('Записан', 'Пришел', 'Не пришел', 'Перенес', 'Отказ', 'Продажа')),
  status_after_fb text check (status_after_fb in ('Записан', 'Пришел', 'Не пришел', 'Перенес', 'Отказ', 'Продажа')),
  manager_id uuid references public.employees(id) on delete set null,
  comment text,
  created_at timestamptz default now()
);

-- Monthly plans (general + per employee)
create table if not exists public.month_plans (
  id uuid default gen_random_uuid() primary key,
  employee_id uuid references public.employees(id) on delete cascade,
  month text not null, -- format: YYYY-MM
  is_general boolean default false,
  plan_consultations int default 0,
  plan_leads int default 0,
  plan_nv int default 0,
  plan_fv int default 0,
  plan_sales int default 0,
  plan_revenue numeric default 0,
  avg_check numeric default 7000,
  conversion_fv_sale numeric default 0.60,
  conversion_nv_fv numeric default 0.60,
  unique(employee_id, month),
  unique nulls not distinct (is_general, month) -- only one general plan per month
);

-- Daily facts per employee
create table if not exists public.daily_facts (
  id uuid default gen_random_uuid() primary key,
  employee_id uuid references public.employees(id) on delete cascade,
  date date not null,
  was_present boolean default false,
  consultations_fact int default 0,
  leads_fact int default 0,
  nv_fact int default 0,
  fv_fact int default 0,
  sales_fact int default 0,
  revenue_fact numeric default 0,
  delivery_cost numeric default 0,
  note text,
  unique(employee_id, date)
);

-- KPI settings per employee role
create table if not exists public.kpi_settings (
  id uuid default gen_random_uuid() primary key,
  role_type text not null,
  month text not null,
  kpi_name text not null,
  threshold_percent numeric,
  bonus_amount numeric default 0,
  note text,
  unique(role_type, month, kpi_name)
);

-- Salary records
create table if not exists public.salary_records (
  id uuid default gen_random_uuid() primary key,
  employee_id uuid references public.employees(id) on delete cascade,
  month text not null,
  base_salary numeric default 0,
  bonus numeric default 0,
  kpi_crm numeric default 0,
  kpi_conversion numeric default 0,
  kpi_total_plan numeric default 0,
  daily_bonus numeric default 0,
  total numeric default 0,
  calculated_at timestamptz default now(),
  unique(employee_id, month)
);

-- Finance records
create table if not exists public.finance_records (
  id uuid default gen_random_uuid() primary key,
  date date not null,
  type text not null check (type in ('income', 'fixed_expense', 'variable_expense')),
  category text not null,
  description text,
  amount numeric not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.profiles enable row level security;
alter table public.employees enable row level security;
alter table public.consultations enable row level security;
alter table public.month_plans enable row level security;
alter table public.daily_facts enable row level security;
alter table public.kpi_settings enable row level security;
alter table public.salary_records enable row level security;
alter table public.finance_records enable row level security;

-- Profiles: users see their own, owner sees all
create policy "profiles_select" on public.profiles for select using (
  auth.uid() = id or
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);
create policy "profiles_insert_owner" on public.profiles for insert with check (true);

-- Employees: owner sees all, employee sees own
create policy "employees_select" on public.employees for select using (
  user_id = auth.uid() or
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner', 'manager'))
);
create policy "employees_all_owner" on public.employees for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
);

-- Consultations: manager/owner see all, employee sees own recorded
create policy "consultations_select" on public.consultations for select using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner', 'manager'))
  or
  exists (
    select 1 from public.employees e
    where e.user_id = auth.uid() and e.id = manager_id
  )
);
create policy "consultations_insert" on public.consultations for insert with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner', 'manager'))
);
create policy "consultations_update" on public.consultations for update using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner', 'manager'))
  or
  exists (
    select 1 from public.employees e
    where e.user_id = auth.uid() and e.id = manager_id
  )
);

-- Daily facts: employee sees/edits own, owner/manager sees all
create policy "daily_facts_select" on public.daily_facts for select using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner', 'manager'))
  or
  exists (select 1 from public.employees e where e.user_id = auth.uid() and e.id = employee_id)
);
create policy "daily_facts_insert_own" on public.daily_facts for insert with check (
  exists (select 1 from public.employees e where e.user_id = auth.uid() and e.id = employee_id)
  or
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner', 'manager'))
);
create policy "daily_facts_update_own" on public.daily_facts for update using (
  exists (select 1 from public.employees e where e.user_id = auth.uid() and e.id = employee_id)
  or
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner', 'manager'))
);

-- Finance: owner only
create policy "finance_owner" on public.finance_records for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
);

-- Salary: owner sees all, employee sees own
create policy "salary_select" on public.salary_records for select using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner', 'manager'))
  or
  exists (select 1 from public.employees e where e.user_id = auth.uid() and e.id = employee_id)
);
create policy "salary_all_owner" on public.salary_records for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
);

-- Month plans: owner manages, employees see own
create policy "plans_select" on public.month_plans for select using (
  is_general = true
  or
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner', 'manager'))
  or
  exists (select 1 from public.employees e where e.user_id = auth.uid() and e.id = employee_id)
);
create policy "plans_all_owner" on public.month_plans for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
);

-- KPI settings: owner manages, all can read
create policy "kpi_read" on public.kpi_settings for select using (true);
create policy "kpi_owner" on public.kpi_settings for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
);

-- Function: auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'employee')
  );
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- Migration v2: Decomposition overhaul
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Add new fields to consultations
alter table public.consultations
  add column if not exists amount numeric default 0,
  add column if not exists delivery_cost numeric default 0,
  add column if not exists is_nv boolean default false;

-- Fix status values to include Купил/Не купил/Думает as actual_status
alter table public.consultations
  drop constraint if exists consultations_actual_status_check;
alter table public.consultations
  add constraint consultations_actual_status_check
    check (actual_status in ('Записан','Пришел','Не пришел','Перенес','Отказ','Продажа','Купил','Не купил','Думает'));

-- 2. Expand month_plans with full decomposition metrics
alter table public.month_plans
  add column if not exists plan_appeals int default 0,
  add column if not exists plan_leads_qualified int default 0,
  add column if not exists plan_scheduled_meetings int default 0,
  add column if not exists plan_actual_meetings int default 0,
  add column if not exists plan_sales_after_meeting int default 0,
  add column if not exists plan_revenue_after_meeting numeric default 0,
  add column if not exists plan_sales_nv int default 0,
  add column if not exists plan_revenue_nv numeric default 0,
  add column if not exists plan_avg_check_meeting numeric default 0,
  add column if not exists plan_avg_check_nv numeric default 0,
  add column if not exists plan_work_days int default 22,
  add column if not exists work_schedule text default '5/2';

-- 3. Expand daily_facts with manual AmoCRM metrics
alter table public.daily_facts
  add column if not exists appeals_fact int default 0,
  add column if not exists leads_qualified_fact int default 0,
  add column if not exists scheduled_meetings_fact int default 0;

-- Remove old columns that are now auto-calculated
-- (keep them for backwards compat, just stop using them in UI)

-- 4. Create attendance table for work day tracking
create table if not exists public.attendance (
  id uuid default gen_random_uuid() primary key,
  employee_id uuid references public.employees(id) on delete cascade,
  date date not null,
  status text not null default 'working'
    check (status in ('working','sick','vacation','day_off','absent','weekend')),
  auto_tracked boolean default false,
  override_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now(),
  unique(employee_id, date)
);

-- 5. Create activity_log for auto attendance detection
create table if not exists public.activity_log (
  id uuid default gen_random_uuid() primary key,
  employee_id uuid references public.employees(id) on delete cascade,
  action text not null,
  created_at timestamptz default now()
);

-- 6. RLS for new tables
alter table public.attendance enable row level security;
alter table public.activity_log enable row level security;

-- Attendance: owner sees all, employee sees own
create policy "attendance_select_owner" on public.attendance for select
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('owner','manager'))
  );
create policy "attendance_select_employee" on public.attendance for select
  using (
    exists (select 1 from public.employees e where e.user_id = auth.uid() and e.id = employee_id)
  );
create policy "attendance_all_owner" on public.attendance for all
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('owner','manager'))
  );

-- Activity log: employee inserts own, owner sees all
create policy "activity_log_insert" on public.activity_log for insert
  with check (
    exists (select 1 from public.employees e where e.user_id = auth.uid() and e.id = employee_id)
  );
create policy "activity_log_select_owner" on public.activity_log for select
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('owner','manager'))
  );
create policy "activity_log_select_own" on public.activity_log for select
  using (
    exists (select 1 from public.employees e where e.user_id = auth.uid() and e.id = employee_id)
  );

-- 7. Function: auto-mark attendance when employee performs action
create or replace function public.auto_mark_attendance()
returns trigger language plpgsql security definer as $$
begin
  -- Try to insert working day if not exists for today
  insert into public.attendance (employee_id, date, status, auto_tracked)
  values (new.employee_id, current_date, 'working', true)
  on conflict (employee_id, date) do nothing;
  return new;
end;
$$;

-- Trigger on activity_log
drop trigger if exists trg_auto_attendance on public.activity_log;
create trigger trg_auto_attendance
  after insert on public.activity_log
  for each row execute function public.auto_mark_attendance();

-- 8. daily_facts: owner/manager full access, employee own only
drop policy if exists "daily_facts_select" on public.daily_facts;
drop policy if exists "daily_facts_insert_own" on public.daily_facts;
drop policy if exists "daily_facts_update_own" on public.daily_facts;

create policy "daily_facts_select_owner" on public.daily_facts for select
  using (exists (select 1 from public.profiles where id = auth.uid() and role in ('owner','manager')));
create policy "daily_facts_select_own" on public.daily_facts for select
  using (exists (select 1 from public.employees e where e.user_id = auth.uid() and e.id = employee_id));
create policy "daily_facts_insert" on public.daily_facts for insert
  with check (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('owner','manager'))
    or
    exists (select 1 from public.employees e where e.user_id = auth.uid() and e.id = employee_id)
  );
create policy "daily_facts_update" on public.daily_facts for update
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('owner','manager'))
    or
    exists (select 1 from public.employees e where e.user_id = auth.uid() and e.id = employee_id)
  );

-- Done!
select 'Migration v2 complete' as result;

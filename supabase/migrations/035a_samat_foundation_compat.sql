-- Совместимость двух веток CRM: колонка уже могла быть добавлена вручную на production.
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS schedule_anchor_date DATE;


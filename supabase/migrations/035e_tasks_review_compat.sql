-- Новая двухступенчатая проверка поверх существующей Kanban-схемы.
-- Статусы остаются todo/in_progress/review/done, поэтому старые клиенты совместимы.
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmed_by UUID REFERENCES public.employees(id),
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;


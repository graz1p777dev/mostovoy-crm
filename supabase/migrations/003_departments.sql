-- ============================================================
-- Migration 003: departments
-- Отделы компании.
-- ПРИМЕЧАНИЕ: FK departments.manager_id → employees.id
-- добавляется ПОСЛЕ создания таблицы employees (в 005).
-- ============================================================

CREATE TABLE public.departments (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  manager_id  UUID,        -- FK → employees.id добавляется позже в 005
  is_active   BOOLEAN      NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Индексы
CREATE INDEX idx_departments_manager_id ON public.departments(manager_id);

-- Триггер updated_at
CREATE TRIGGER set_departments_updated_at
  BEFORE UPDATE ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "departments_select_authenticated"
  ON public.departments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "departments_insert_owner"
  ON public.departments FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_role() = 'owner');

CREATE POLICY "departments_update_owner"
  ON public.departments FOR UPDATE
  TO authenticated
  USING (public.get_my_role() = 'owner');

CREATE POLICY "departments_delete_owner"
  ON public.departments FOR DELETE
  TO authenticated
  USING (public.get_my_role() = 'owner');

-- Seed: отдел продаж (MVP)
INSERT INTO public.departments (name, description) VALUES
  ('Отдел продаж', 'Основной отдел продаж Demi Results');

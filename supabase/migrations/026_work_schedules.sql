-- ============================================================
-- Migration 026: Work Schedules
-- Создаёт таблицу work_schedules для управления графиками работы.
-- employees.schedule_type остаётся текстовым — хранит name из этой таблицы.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.work_schedules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(50) NOT NULL UNIQUE,
  description TEXT,
  is_system   BOOLEAN NOT NULL DEFAULT false,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Базовые (системные) графики
INSERT INTO public.work_schedules (name, description, is_system) VALUES
  ('5/2',       'Стандартная пятидневка (Пн–Пт)', true),
  ('2/2',       '2 дня работы, 2 выходных (скользящий)',  true),
  ('6/1',       '6 дней работы, 1 выходной',               true),
  ('3 через 1', '3 дня работы, 1 выходной (скользящий)',  true)
ON CONFLICT (name) DO NOTHING;

-- RLS
ALTER TABLE public.work_schedules ENABLE ROW LEVEL SECURITY;

-- Все авторизованные могут читать активные графики
CREATE POLICY "work_schedules_select"
  ON public.work_schedules FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Только owner управляет
CREATE POLICY "work_schedules_insert"
  ON public.work_schedules FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_role() = 'owner' OR public.get_my_permission_level() = 'owner');

CREATE POLICY "work_schedules_update"
  ON public.work_schedules FOR UPDATE
  TO authenticated
  USING (public.get_my_role() = 'owner' OR public.get_my_permission_level() = 'owner');

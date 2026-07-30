-- ============================================================
-- Migration 018: Realtime Configuration
-- Включение Supabase Realtime для нужных таблиц.
-- Выполняется после создания всех таблиц.
-- ============================================================

-- Realtime уже включён для notifications в 012.
-- Добавляем остальные таблицы:

ALTER PUBLICATION supabase_realtime ADD TABLE public.consultations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance;
ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_facts;

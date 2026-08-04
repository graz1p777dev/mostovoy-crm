-- ─── 079: возврат таблиц в realtime-публикацию ────────────────────────────────
--
-- ПОЧЕМУ. При переезде staging Токио → Стокгольм (2026-07-29) потерялось членство
-- таблиц в publication supabase_realtime: `supabase db dump --schema public` не
-- выгружает ALTER PUBLICATION, потому что публикация — объект уровня базы, а не схемы.
-- В результате на новом staging перестали обновляться вживую лента «Записи» на
-- дашборде (подписка на consultations) и счётчик уведомлений в шапке (notifications).
-- Данные при этом не терялись — всё появлялось после перезагрузки страницы.
--
-- Состав восстанавливается по 012 (notifications) и 018 (consultations, attendance,
-- daily_facts → ныне daily_activity). Идемпотентно: повторный прогон не упадёт.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['consultations','notifications','attendance','daily_activity'] LOOP
    IF to_regclass('public.'||t) IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM pg_publication_tables
          WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
       ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

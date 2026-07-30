-- Migration 035: базовые привилегии для служебных ролей Supabase.
--
-- Проблема: схема создавалась миграциями 001–034, которые нигде не выдают
-- GRANT'ы ролям anon / authenticated / service_role. В облачном Supabase это
-- сходило с рук — там на схему public стоят default privileges, выданные при
-- инициализации проекта. На чистой базе (self-hosted, supabase CLI) их нет,
-- и получается так:
--   * authenticated не имеет прав ни на одну таблицу → RLS-политики
--     недостижимы, любой запрос падает с 42501, вход зацикливается;
--   * service_role тоже пуст → серверные скрипты и seed не работают.
--
-- RLS остаётся единственным механизмом разграничения строк: authenticated
-- получает права на таблицу, а какие строки ему видны — решают политики.
-- anon намеренно не получает ничего: публичного доступа к данным CRM нет.

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- service_role используется серверным кодом и обходит RLS по определению.
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Обычный вошедший пользователь: доступ к таблицам есть, строки фильтрует RLS.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- Чтобы будущие миграции не приходилось сопровождать GRANT'ами вручную.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated;

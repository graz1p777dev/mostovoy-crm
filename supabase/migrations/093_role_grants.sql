-- Migration 093: базовые привилегии для служебных ролей Supabase.
--
-- (Была 035; перенумерована в 093 при слиянии с миграциями смежной CRM,
-- которая уже занимала номера 035a–092.)
--
-- Проблема: схема создавалась миграциями 001–092, которые нигде не выдают
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

-- ВНИМАНИЕ: здесь НЕТ «GRANT EXECUTE ON ALL FUNCTIONS ... TO authenticated».
-- Пока миграция стояла под номером 035, она выполнялась до 036–092 и такой
-- строкой ничего не ломала. После переноса в конец очереди она бы отменила
-- около девяноста осознанных «REVOKE ALL ON FUNCTION ... FROM PUBLIC/
-- authenticated» из миграций 037–092 — и клиент с anon-ключом смог бы дёрнуть
-- по RPC dismiss_employee, create_role_with_permissions, save_expense и прочие
-- SECURITY DEFINER-функции, доступные только service_role. Строка не нужна:
-- PostgreSQL по умолчанию выдаёт EXECUTE роли PUBLIC, поэтому authenticated и
-- так может вызывать всё, у чего право явно не отобрано.

-- ─────────────────────────────────────────────────────────────────────────────
-- Восстановление точечных ограничений, которые снял бы «GRANT ... ON ALL TABLES»
-- выше. Миграции 061–087 намеренно закрыли часть таблиц: писать в них можно
-- только через SECURITY DEFINER-RPC под service_role, клиенту оставлено чтение
-- (а строки всё так же фильтрует RLS). Блок повторяет ровно те же строки —
-- он нужен потому, что общий GRANT теперь идёт ПОСЛЕ них, а не до.
-- Добавляя сюда новые миграции с таким же «locked»-паттерном, дописывай таблицу
-- в один из двух списков ниже.

-- Только чтение: партнёры, контент, маркетинг и все финансовые таблицы.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'partners', 'partner_types', 'content_posts',
    'marketing_topups', 'marketing_channel_plan',
    'expense_categories', 'expenses', 'other_income', 'debts',
    'investor_deal_types', 'investors', 'investor_payouts',
    'profit_distribution_rules', 'profit_distributions', 'profit_distribution_lines',
    'cash_accounts', 'cash_movements'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
      EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated', t);
      EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
    END IF;
  END LOOP;
END $$;

-- Посещаемость и отпуска: читать можно, менять — только через RPC.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'attendance', 'attendance_corrections', 'attendance_alerts',
    'attendance_explanations', 'vacation_requests'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format(
        'REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.%I FROM anon, authenticated', t);
    END IF;
  END LOOP;
END $$;

-- Чтобы будущие миграции не приходилось сопровождать GRANT'ами вручную.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated;

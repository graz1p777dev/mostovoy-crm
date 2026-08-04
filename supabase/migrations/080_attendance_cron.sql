-- ─── 080: планировщик автопрогулов ────────────────────────────────────────────
--
-- Автопрогул (mark_absentees, миграция 078) должен ставиться через час после начала
-- смены независимо от того, открыл ли кто-нибудь экран. Владелец выбрал pg_cron:
-- надёжность срабатывания важнее отсутствия зависимости.
--
-- Расписание: каждые 15 минут. Функция сама проверяет, что прошёл час от начала
-- смены конкретного сотрудника, поэтому частота влияет только на задержку фиксации
-- (максимум 15 минут), а не на корректность.
--
-- ВАЖНО: cron.schedule выполняется в контексте расширения; при отсутствии pg_cron
-- миграция не падает, а сообщает — чтобы прогон на окружении без расширения
-- (например, локальный харнесс) не ломал всю цепочку.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron;

    -- снимаем прежнее задание, если было (идемпотентность)
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'attendance_mark_absentees';

    PERFORM cron.schedule(
      'attendance_mark_absentees',
      '*/15 * * * *',
      $cron$SELECT public.mark_absentees();$cron$
    );
    RAISE NOTICE '080: задание attendance_mark_absentees создано (каждые 15 минут)';
  ELSE
    RAISE NOTICE '080: pg_cron недоступен — автопрогулы придётся запускать вручную';
  END IF;
END $$;

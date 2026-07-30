-- Migration 026a: переименование основных таблиц
--
-- Эти изменения были выполнены вручную в облачной базе и не попали в миграции,
-- из-за чего папку migrations нельзя было применить к чистой БД: начиная с 027
-- миграции обращаются к новым именам (sales_plan_weekly, daily_activity,
-- finance_periods), которых ни одна предыдущая миграция не создаёт.
--
-- Порядок взят из шапки 027: переименования произошли после 016 и 021,
-- но до 027. Удаление consultation_results вынесено в 025a.
--
-- Идемпотентна: на боевой базе, где переименование уже сделано, ничего не меняет.
-- Имена индексов, ограничений и RLS-политик намеренно НЕ трогаем — в проде они
-- сохранили старые имена (daily_facts_*, decomposition_*, finances_*).

DO $$
BEGIN
  IF to_regclass('public.daily_facts') IS NOT NULL
     AND to_regclass('public.daily_activity') IS NULL THEN
    ALTER TABLE public.daily_facts RENAME TO daily_activity;
  END IF;

  IF to_regclass('public.decomposition') IS NOT NULL
     AND to_regclass('public.sales_plan_weekly') IS NULL THEN
    ALTER TABLE public.decomposition RENAME TO sales_plan_weekly;
  END IF;

  IF to_regclass('public.finances') IS NOT NULL
     AND to_regclass('public.finance_periods') IS NULL THEN
    ALTER TABLE public.finances RENAME TO finance_periods;
  END IF;
END $$;

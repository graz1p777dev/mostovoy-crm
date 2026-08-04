-- ─── 049: ручной ввод факта по посетителям «с улицы» (без записи) ─────────────
--
-- Экран менеджера продаж получает форму ручного ввода. Часть её — посетители
-- без записи: пришли с улицы, их никто заранее не заводил в систему.
--
-- ПОЧЕМУ НОВЫЕ КОЛОНКИ, А НЕ СУЩЕСТВУЮЩИЕ nv_sales_fact / nv_revenue_fact:
-- те поля называются «продажи/выручка по НВ» — то есть по НАЗНАЧЕННЫМ визитам,
-- прямо противоположный смысл. Они с самого начала (миграция 008) никем не
-- читаются и не пишутся; переиспользовать их под «с улицы» — гарантированная
-- путаница при следующем чтении кода. Оставляем их как есть, заводим явные.
--
-- СЕМАНТИКА NULL: посетители без записи уже выводятся автоматически из
-- consultations (is_nv = false). Поэтому здесь NULL = «ручной правки нет,
-- считай из консультаций», а заполненное значение перекрывает авто-подсчёт
-- за этот день и этого сотрудника — ровно как fv_fact/sales_fact/revenue_fact.

ALTER TABLE public.daily_activity
  ADD COLUMN IF NOT EXISTS walk_in_visitors_fact INTEGER,
  ADD COLUMN IF NOT EXISTS walk_in_sales_fact    INTEGER,
  ADD COLUMN IF NOT EXISTS walk_in_revenue_fact  NUMERIC(12,2);

ALTER TABLE public.daily_activity
  DROP CONSTRAINT IF EXISTS daily_activity_walk_in_visitors_check;
ALTER TABLE public.daily_activity
  ADD CONSTRAINT daily_activity_walk_in_visitors_check
  CHECK (walk_in_visitors_fact IS NULL OR walk_in_visitors_fact >= 0);

ALTER TABLE public.daily_activity
  DROP CONSTRAINT IF EXISTS daily_activity_walk_in_sales_check;
ALTER TABLE public.daily_activity
  ADD CONSTRAINT daily_activity_walk_in_sales_check
  CHECK (walk_in_sales_fact IS NULL OR walk_in_sales_fact >= 0);

ALTER TABLE public.daily_activity
  DROP CONSTRAINT IF EXISTS daily_activity_walk_in_revenue_check;
ALTER TABLE public.daily_activity
  ADD CONSTRAINT daily_activity_walk_in_revenue_check
  CHECK (walk_in_revenue_fact IS NULL OR walk_in_revenue_fact >= 0);

COMMENT ON COLUMN public.daily_activity.walk_in_visitors_fact IS
  'Ручной факт: посетителей без записи за день. NULL — считать из consultations (is_nv=false). Миграция 049.';
COMMENT ON COLUMN public.daily_activity.walk_in_sales_fact IS
  'Ручной факт: продаж посетителям без записи. NULL — считать из consultations. Миграция 049.';
COMMENT ON COLUMN public.daily_activity.walk_in_revenue_fact IS
  'Ручной факт: выручка с посетителей без записи. NULL — считать из consultations. Миграция 049.';

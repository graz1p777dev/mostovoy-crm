-- ============================================================
-- Migration 014: integrations + settings
-- Внешние интеграции и глобальные настройки компании.
-- ============================================================

-- ------------------------------------------------------------
-- Таблица: integrations
-- ------------------------------------------------------------
CREATE TABLE public.integrations (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name             VARCHAR(100) NOT NULL,
  type             TEXT         NOT NULL,
  is_active        BOOLEAN      NOT NULL DEFAULT false,
  config           JSONB,       -- хранит зашифрованные API ключи
  last_sync_at     TIMESTAMPTZ,
  last_sync_status TEXT,
  last_sync_error  TEXT,
  webhook_url      TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT integrations_name_unique UNIQUE (name),
  CONSTRAINT integrations_type_check  CHECK (
    type IN ('crm','telegram','sheets','shop','other')
  )
);

-- Индексы
CREATE INDEX idx_integrations_type      ON public.integrations(type);
CREATE INDEX idx_integrations_is_active ON public.integrations(is_active);

-- Триггер updated_at
CREATE TRIGGER set_integrations_updated_at
  BEFORE UPDATE ON public.integrations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "integrations_select_owner"
  ON public.integrations FOR SELECT
  TO authenticated
  USING (public.get_my_role() = 'owner');

CREATE POLICY "integrations_insert_owner"
  ON public.integrations FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_role() = 'owner');

CREATE POLICY "integrations_update_owner"
  ON public.integrations FOR UPDATE
  TO authenticated
  USING (public.get_my_role() = 'owner');

CREATE POLICY "integrations_delete_owner"
  ON public.integrations FOR DELETE
  TO authenticated
  USING (public.get_my_role() = 'owner');

-- Seed: доступные интеграции (неактивные)
INSERT INTO public.integrations (name, type) VALUES
  ('amoCRM',   'crm'),
  ('Telegram', 'telegram'),
  ('Google Sheets', 'sheets');

-- ------------------------------------------------------------
-- Таблица: settings (singleton)
-- ------------------------------------------------------------
CREATE TABLE public.settings (
  id                 UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name       VARCHAR(255)  NOT NULL DEFAULT 'Demi Results',
  logo_url           TEXT,
  timezone           VARCHAR(50)   NOT NULL DEFAULT 'Asia/Bishkek',
  currency           VARCHAR(10)   NOT NULL DEFAULT 'KGS',
  week_start_day     SMALLINT      NOT NULL DEFAULT 1,
  month_start_day    SMALLINT      NOT NULL DEFAULT 1,
  salary_close_day   SMALLINT      NOT NULL DEFAULT 25,
  salary_pay_day     SMALLINT      NOT NULL DEFAULT 5,
  default_work_start TIME          NOT NULL DEFAULT '09:00',
  default_work_end   TIME          NOT NULL DEFAULT '18:00',
  absence_alert_time TIME          NOT NULL DEFAULT '12:00',
  kpi_alert_threshold NUMERIC(5,2) NOT NULL DEFAULT 30.0,
  theme              TEXT          NOT NULL DEFAULT 'light',
  language           VARCHAR(5)    NOT NULL DEFAULT 'ru',
  extra              JSONB         DEFAULT '{}',
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT settings_week_start_check   CHECK (week_start_day BETWEEN 1 AND 7),
  CONSTRAINT settings_month_start_check  CHECK (month_start_day BETWEEN 1 AND 28),
  CONSTRAINT settings_salary_close_check CHECK (salary_close_day BETWEEN 1 AND 31),
  CONSTRAINT settings_salary_pay_check   CHECK (salary_pay_day BETWEEN 1 AND 31),
  CONSTRAINT settings_theme_check        CHECK (theme IN ('light','dark','system'))
);

-- Триггер updated_at
CREATE TRIGGER set_settings_updated_at
  BEFORE UPDATE ON public.settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "settings_select_authenticated"
  ON public.settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "settings_update_owner"
  ON public.settings FOR UPDATE
  TO authenticated
  USING (public.get_my_role() = 'owner');

-- INSERT и DELETE запрещены (singleton, создаётся один раз)
-- Seed: начальные настройки
INSERT INTO public.settings (company_name, timezone, currency) VALUES
  ('Demi Results', 'Asia/Bishkek', 'KGS');

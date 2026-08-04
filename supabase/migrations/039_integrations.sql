-- ============================================================
-- Migration 039: интеграции («Интеграции» — Товароучёт / Bitrix24 / amoCRM)
--
-- Две таблицы:
--   integration_connections — одна строка на внешнего провайдера (bitrix24,
--     amocrm). Учётные данные хранятся ТОЛЬКО в зашифрованном виде
--     (config_encrypted — AES-256-GCM blob, шифрование/расшифровка на
--     сервере в src/lib/integrations/crypto.ts, ключ никогда не попадает
--     в БД). webhook_secret — случайная строка, часть URL входящего
--     вебхука для этого провайдера (Bitrix24/amoCRM не умеют слать
--     кастомные заголовки, поэтому секрет живёт в пути, не в header).
--     provider='inventory' в этой таблице не хранится: Товароучёт — та же
--     БД, статус считается live-запросом к inventory_*, а не отсюда.
--   integration_events — короткий журнал входящих вебхуков. Хранится не
--     сырой payload, а короткая сводка (payload_summary) — без долгого
--     хранения потенциального PII.
--
-- Доступ — только owner/rop (см. CLAUDE.md: чувствительный конфиг).
-- GRANT'ы обязательны явно — см. 093_role_grants.sql про 42501 в проде.
-- ============================================================

CREATE TABLE public.integration_connections (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider         TEXT        NOT NULL UNIQUE,
  status           TEXT        NOT NULL DEFAULT 'not_configured',
  config_encrypted TEXT,
  webhook_secret   TEXT,
  last_checked_at  TIMESTAMPTZ,
  last_error       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT integration_connections_provider_check CHECK (
    provider IN ('inventory', 'bitrix24', 'amocrm')
  ),
  CONSTRAINT integration_connections_status_check CHECK (
    status IN ('not_configured', 'configured', 'connected', 'error')
  )
);

CREATE TRIGGER trg_integration_connections_updated_at
  BEFORE UPDATE ON public.integration_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.integration_events (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider        TEXT        NOT NULL,
  payload_summary TEXT        NOT NULL,
  received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT integration_events_provider_check CHECK (
    provider IN ('inventory', 'bitrix24', 'amocrm')
  )
);

CREATE INDEX idx_integration_events_provider ON public.integration_events(provider, received_at DESC);

-- ------------------------------------------------------------
-- RLS — только owner/rop, аналогично deal_stages/deals (094_deals.sql).
-- ------------------------------------------------------------

ALTER TABLE public.integration_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_events      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "integration_connections_select" ON public.integration_connections
  FOR SELECT TO authenticated
  USING (public.get_my_role() IN ('owner', 'rop'));

CREATE POLICY "integration_connections_insert" ON public.integration_connections
  FOR INSERT TO authenticated
  WITH CHECK (public.get_my_role() IN ('owner', 'rop'));

CREATE POLICY "integration_connections_update" ON public.integration_connections
  FOR UPDATE TO authenticated
  USING (public.get_my_role() IN ('owner', 'rop'))
  WITH CHECK (public.get_my_role() IN ('owner', 'rop'));

CREATE POLICY "integration_connections_delete" ON public.integration_connections
  FOR DELETE TO authenticated
  USING (public.get_my_role() IN ('owner', 'rop'));

-- Событий вебхуков клиент никогда не пишет — их создаёт только серверный
-- маршрут вебхука через admin-клиент (service_role, RLS обходит по
-- определению). authenticated только читает, для карточки «последние события».
CREATE POLICY "integration_events_select" ON public.integration_events
  FOR SELECT TO authenticated
  USING (public.get_my_role() IN ('owner', 'rop'));

-- ------------------------------------------------------------
-- GRANT'ы. Без явного GRANT authenticated упрётся в 42501 в облаке
-- (см. 093_role_grants.sql) — RLS выше единственный фильтр строк, но
-- сам доступ к таблице Data API должен быть выдан явно.
-- ------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.integration_connections TO authenticated;
GRANT SELECT                         ON public.integration_events      TO authenticated;

GRANT ALL ON public.integration_connections TO service_role;
GRANT ALL ON public.integration_events      TO service_role;

-- ============================================================
-- Migration 036: deals (воронка продаж)
--
-- Сделки магазина «МОСТОВОЙ». Этапы воронки взяты из amoCRM-аккаунта
-- магазина, но самой интеграции с amoCRM нет: в их аккаунте не оказалось
-- ни одной сделки, переносить было нечего — сохранили только структуру.
--
-- Три таблицы:
--   deal_stages — этапы воронки. Отдельная таблица, а не CHECK-константа:
--                 владелец должен уметь переименовывать и переставлять
--                 этапы, не трогая код. kind = normal | won | lost,
--                 терминальные этапы отмечены отдельно, чтобы отчётность
--                 могла считать конверсию и потери.
--   deals       — сама сделка. external_key UNIQUE — ключ идемпотентности:
--                 клиент, написавший боту второй раз, не создаёт вторую
--                 сделку (см. server/services/crm.js витрины и
--                 /api/internal/deals в этом приложении).
--   deal_events — журнал переходов между этапами (append-only). Пишется
--                 триггером, а не приложением: так история не теряется,
--                 откуда бы сделку ни двигали, и по ней считается время
--                 в этапе.
-- ============================================================

-- ------------------------------------------------------------
-- Этапы воронки
-- ------------------------------------------------------------
CREATE TABLE public.deal_stages (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(120) NOT NULL,
  sort_order  INTEGER      NOT NULL DEFAULT 0,
  kind        TEXT         NOT NULL DEFAULT 'normal',
  color       TEXT         NOT NULL DEFAULT '#94a3b8',
  is_default  BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT deal_stages_kind_check CHECK (kind IN ('normal','won','lost'))
);

CREATE INDEX idx_deal_stages_order ON public.deal_stages(sort_order);
-- Этап по умолчанию ровно один — в него падают автосозданные сделки.
CREATE UNIQUE INDEX idx_deal_stages_default ON public.deal_stages(is_default) WHERE is_default;

CREATE TRIGGER trg_deal_stages_updated_at
  BEFORE UPDATE ON public.deal_stages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------
-- Сделки
-- ------------------------------------------------------------
CREATE TABLE public.deals (
  id                      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  title                   VARCHAR(300) NOT NULL,
  stage_id                UUID         NOT NULL REFERENCES public.deal_stages(id) ON DELETE RESTRICT,
  amount                  NUMERIC(12,2),
  currency                TEXT         NOT NULL DEFAULT 'KGS',
  customer_name           VARCHAR(200),
  customer_phone          VARCHAR(32),
  customer_username       VARCHAR(120),
  source                  TEXT         NOT NULL DEFAULT 'manual',
  -- Ключ внешней системы: telegram:<chat_id> / wazzup:<phone> и т.п.
  -- UNIQUE делает автосоздание идемпотентным.
  external_key            TEXT         UNIQUE,
  responsible_employee_id UUID         REFERENCES public.employees(id) ON DELETE SET NULL,
  note                    TEXT,
  -- Производное от kind текущего этапа, синхронизируется триггером ниже.
  status                  TEXT         NOT NULL DEFAULT 'open',
  -- Когда сделка попала в текущий этап — «время в этапе» на карточке.
  stage_changed_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at              TIMESTAMPTZ,

  -- Валюты — те же, что у витрины (SHOP_CURRENCIES), продают в KGS и USD.
  CONSTRAINT deals_currency_check CHECK (currency IN ('KGS','USD','RUB')),
  CONSTRAINT deals_source_check   CHECK (source   IN ('telegram','whatsapp','instagram','manual','site')),
  CONSTRAINT deals_status_check   CHECK (status   IN ('open','won','lost')),
  CONSTRAINT deals_title_check    CHECK (btrim(title) <> '')
);

CREATE INDEX idx_deals_stage       ON public.deals(stage_id);
CREATE INDEX idx_deals_responsible ON public.deals(responsible_employee_id);
CREATE INDEX idx_deals_source      ON public.deals(source);
CREATE INDEX idx_deals_active      ON public.deals(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_deals_phone       ON public.deals(customer_phone);

CREATE TRIGGER trg_deals_updated_at
  BEFORE UPDATE ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------
-- Журнал переходов
-- ------------------------------------------------------------
CREATE TABLE public.deal_events (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id       UUID        NOT NULL REFERENCES public.deals(id)       ON DELETE CASCADE,
  from_stage_id UUID        REFERENCES public.deal_stages(id)          ON DELETE SET NULL,
  to_stage_id   UUID        NOT NULL REFERENCES public.deal_stages(id) ON DELETE RESTRICT,
  employee_id   UUID        REFERENCES public.employees(id)            ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_deal_events_deal ON public.deal_events(deal_id, created_at);

-- ------------------------------------------------------------
-- status и stage_changed_at всегда следуют за этапом.
-- BEFORE-триггер: считает kind нового этапа и проставляет их сам,
-- чтобы приложение не могло рассинхронизировать сделку с воронкой.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_deal_stage_state()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  stage_kind TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.stage_id IS NOT DISTINCT FROM OLD.stage_id THEN
    RETURN NEW;
  END IF;

  SELECT kind INTO stage_kind FROM public.deal_stages WHERE id = NEW.stage_id;
  NEW.status := CASE stage_kind WHEN 'won' THEN 'won' WHEN 'lost' THEN 'lost' ELSE 'open' END;

  IF TG_OP = 'UPDATE' THEN
    NEW.stage_changed_at := NOW();
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_deals_sync_stage_state
  BEFORE INSERT OR UPDATE OF stage_id ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.sync_deal_stage_state();

-- ------------------------------------------------------------
-- Запись в журнал на каждый переход, включая появление сделки.
-- SECURITY DEFINER: журнал append-only, у authenticated нет INSERT-политики
-- на deal_events, пишет только этот триггер.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_deal_stage_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.stage_id IS NOT DISTINCT FROM OLD.stage_id THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.deal_events (deal_id, from_stage_id, to_stage_id, employee_id)
  VALUES (
    NEW.id,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.stage_id ELSE NULL END,
    NEW.stage_id,
    public.get_my_employee_id()
  );

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_deals_log_stage_change
  AFTER INSERT OR UPDATE OF stage_id ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.log_deal_stage_change();

-- ------------------------------------------------------------
-- Видимость сделки. Owner и РОП видят всю воронку; менеджер — свои сделки
-- и ничьи (в «Неразобранном» сделки приходят без ответственного, иначе их
-- некому будет разобрать). Бухгалтеру воронка не нужна.
-- SECURITY DEFINER не требуется: внутри только get_my_* (уже DEFINER).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_see_deal(d_responsible UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT
    public.get_my_role() IN ('owner','rop')
    OR (
      public.get_my_role() IN ('mp','lmai')
      AND (d_responsible IS NULL OR d_responsible = public.get_my_employee_id())
    );
$$;

GRANT EXECUTE ON FUNCTION public.can_see_deal(UUID) TO authenticated;

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
ALTER TABLE public.deal_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_events ENABLE ROW LEVEL SECURITY;

-- Этапы — справочник: читают все вошедшие, правит владелец.
CREATE POLICY "deal_stages_select" ON public.deal_stages
  FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY "deal_stages_insert" ON public.deal_stages
  FOR INSERT TO authenticated
  WITH CHECK (public.get_my_role() = 'owner');

CREATE POLICY "deal_stages_update" ON public.deal_stages
  FOR UPDATE TO authenticated
  USING (public.get_my_role() = 'owner')
  WITH CHECK (public.get_my_role() = 'owner');

CREATE POLICY "deal_stages_delete" ON public.deal_stages
  FOR DELETE TO authenticated
  USING (public.get_my_role() = 'owner');

-- Сделки
CREATE POLICY "deals_select" ON public.deals
  FOR SELECT TO authenticated
  USING (public.can_see_deal(responsible_employee_id));

CREATE POLICY "deals_insert" ON public.deals
  FOR INSERT TO authenticated
  WITH CHECK (public.get_my_role() IN ('owner','rop','mp','lmai'));

CREATE POLICY "deals_update" ON public.deals
  FOR UPDATE TO authenticated
  USING (public.can_see_deal(responsible_employee_id))
  WITH CHECK (public.get_my_role() IN ('owner','rop','mp','lmai'));

-- Удаление мягкое (deleted_at через UPDATE); жёсткое — только владельцу.
CREATE POLICY "deals_delete" ON public.deals
  FOR DELETE TO authenticated
  USING (public.get_my_role() = 'owner');

-- Журнал: только чтение и только по видимым сделкам. INSERT/UPDATE/DELETE
-- политик нет намеренно — пишет SECURITY DEFINER-триггер выше.
CREATE POLICY "deal_events_select" ON public.deal_events
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_id));

-- ------------------------------------------------------------
-- GRANT'ы. Миграция 035 объясняет, почему без них authenticated упирается
-- в 42501: default privileges покрывают только объекты, созданные после неё
-- тем же владельцем, и полагаться на это в явной миграции не стоит.
-- ------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deal_stages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deals       TO authenticated;
GRANT SELECT                         ON public.deal_events TO authenticated;

GRANT ALL ON public.deal_stages TO service_role;
GRANT ALL ON public.deals       TO service_role;
GRANT ALL ON public.deal_events TO service_role;

-- ------------------------------------------------------------
-- Этапы воронки магазина. Цвета — яркие и различимые между собой.
-- ------------------------------------------------------------
INSERT INTO public.deal_stages (name, sort_order, kind, color, is_default) VALUES
  ('Неразобранное',             1,  'normal', '#94a3b8', TRUE),
  ('Заявка получена',           2,  'normal', '#0ea5e9', FALSE),
  ('Потребность выявлена',      3,  'normal', '#06b6d4', FALSE),
  ('Варианты предложены',       4,  'normal', '#14b8a6', FALSE),
  ('Дожим',                     5,  'normal', '#f59e0b', FALSE),
  ('Интерес подтверждён',       6,  'normal', '#f97316', FALSE),
  ('Готов к покупке',           7,  'normal', '#e11d1d', FALSE),
  ('Передан менеджеру',         8,  'normal', '#ec4899', FALSE),
  ('Сделка выиграна',           9,  'normal', '#84cc16', FALSE),
  ('Успешно реализовано',       10, 'won',    '#16a34a', FALSE),
  ('Закрыто и не реализовано',  11, 'lost',   '#8a817c', FALSE);

-- Realtime — доска обновляется у всех, кто её открыл.
ALTER PUBLICATION supabase_realtime ADD TABLE public.deals;

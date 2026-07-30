-- ============================================================
-- Migration 034: whatsapp_chat
-- «Чат консультации»: WhatsApp-переписка (через Wazzup24) внутри CRM
-- + память о клиенте, которую ведёт ИИ, привязанная к записи на
-- консультацию (public.consultations, уже есть поле phone).
-- ============================================================

ALTER TABLE public.consultations ADD COLUMN ai_memory TEXT;

CREATE TABLE public.whatsapp_messages (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  phone             VARCHAR(20)  NOT NULL,
  direction         TEXT         NOT NULL CHECK (direction IN ('in','out')),
  text              TEXT         NOT NULL,
  wazzup_message_id TEXT,
  sent_by           UUID         REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_whatsapp_messages_phone ON public.whatsapp_messages(phone, created_at);

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- Те же роли, что видят диалоги/консультации: owner/rop/mp/lmai.
CREATE POLICY "whatsapp_messages_select"
  ON public.whatsapp_messages FOR SELECT
  TO authenticated
  USING (public.get_my_role() IN ('owner','rop','mp','lmai'));

CREATE POLICY "whatsapp_messages_insert"
  ON public.whatsapp_messages FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_role() IN ('owner','rop','mp','lmai'));

ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;

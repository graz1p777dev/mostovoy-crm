-- ============================================================
-- Migration 015: audit_logs
-- Лог всех действий. Append-only (UPDATE и DELETE запрещены).
-- ============================================================

CREATE TABLE public.audit_logs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   UUID        REFERENCES public.employees(id) ON DELETE SET NULL,
  action        TEXT        NOT NULL,
  resource_type TEXT        NOT NULL,
  resource_id   UUID,
  old_data      JSONB,
  new_data      JSONB,
  ip_address    INET,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT audit_logs_action_check CHECK (
    action IN ('create','update','delete','login','logout','export','view')
  )
  -- НЕТ ON DELETE CASCADE — аудит сохраняется при удалении объектов
);

-- Индексы
CREATE INDEX idx_audit_employee_id ON public.audit_logs(employee_id);
CREATE INDEX idx_audit_action      ON public.audit_logs(action);
CREATE INDEX idx_audit_resource    ON public.audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_created_at  ON public.audit_logs(created_at DESC);

-- RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- SELECT: только owner
CREATE POLICY "audit_logs_select_owner"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (public.get_my_role() = 'owner');

-- INSERT: любой аутентифицированный (через Server Action, не напрямую)
CREATE POLICY "audit_logs_insert_authenticated"
  ON public.audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- UPDATE: ЗАПРЕЩЁН (append-only) — политика не создаётся

-- DELETE: ЗАПРЕЩЁН (append-only) — политика не создаётся

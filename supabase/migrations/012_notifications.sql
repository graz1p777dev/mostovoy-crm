-- ============================================================
-- Migration 012: notifications
-- Системные уведомления пользователям.
-- ============================================================

CREATE TABLE public.notifications (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID         NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  type        TEXT         NOT NULL,
  title       VARCHAR(255) NOT NULL,
  body        TEXT,
  action_url  TEXT,
  is_read     BOOLEAN      NOT NULL DEFAULT false,
  is_important BOOLEAN     NOT NULL DEFAULT false,
  source_type TEXT,
  source_id   UUID,
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT notifications_type_check CHECK (
    type IN (
      'kpi_alert','kpi_success','plan_100','absence',
      'salary_ready','finance_alert','system','sale'
    )
  )
);

-- Индексы
CREATE INDEX idx_notifications_emp_id  ON public.notifications(employee_id);
CREATE INDEX idx_notifications_is_read ON public.notifications(is_read) WHERE is_read = false;
CREATE INDEX idx_notifications_created ON public.notifications(created_at DESC);
CREATE INDEX idx_notifications_type    ON public.notifications(type);

-- RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Каждый видит только свои уведомления
CREATE POLICY "notifications_select_self"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (employee_id = public.get_my_employee_id());

-- Owner видит все
CREATE POLICY "notifications_select_owner"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (public.get_my_role() = 'owner');

-- INSERT: система и owner
CREATE POLICY "notifications_insert_owner"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_role() = 'owner');

-- UPDATE: пользователь может отметить своё как прочитанное
CREATE POLICY "notifications_update_read_self"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (employee_id = public.get_my_employee_id());

CREATE POLICY "notifications_update_owner"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (public.get_my_role() = 'owner');

-- DELETE
CREATE POLICY "notifications_delete_owner"
  ON public.notifications FOR DELETE
  TO authenticated
  USING (public.get_my_role() = 'owner');

-- Включаем Realtime для таблицы
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

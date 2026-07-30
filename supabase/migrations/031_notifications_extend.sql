-- ============================================================
-- Migration 031: notifications — новые типы + автогенерация из audit_logs
-- Зависимости: 012 (notifications), 015 (audit_logs)
-- ============================================================

-- ------------------------------------------------------------
-- Новые типы уведомлений
-- ------------------------------------------------------------
ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;

ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (
  type IN (
    'kpi_alert','kpi_success','plan_100','absence',
    'salary_ready','finance_alert','system','sale',
    'consultation_booked','consultation_reminder','sale_lead',
    'server_load','deploy','security','audit'
  )
);

-- ------------------------------------------------------------
-- Функция: notify_from_audit_log()
-- Каждая запись в audit_logs с action create/update/delete
-- автоматически превращается в уведомление всем owner'ам
-- (кроме того, кто сам совершил действие).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_from_audit_log()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  actor_name   TEXT;
  action_label TEXT;
BEGIN
  IF NEW.action NOT IN ('create', 'update', 'delete') THEN
    RETURN NEW;
  END IF;

  SELECT name INTO actor_name FROM public.employees WHERE id = NEW.employee_id;

  action_label := CASE NEW.action
    WHEN 'create' THEN 'Добавление'
    WHEN 'update' THEN 'Изменение'
    WHEN 'delete' THEN 'Удаление'
  END;

  INSERT INTO public.notifications (employee_id, type, title, body, source_type, source_id)
  SELECT
    e.id,
    'audit',
    action_label || ': ' || NEW.resource_type,
    COALESCE(actor_name, 'Система') || ' — ' || lower(action_label) || ' в разделе «' || NEW.resource_type || '»',
    NEW.resource_type,
    NEW.resource_id
  FROM public.employees e
  WHERE e.role = 'owner'
    AND e.id IS DISTINCT FROM NEW.employee_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_from_audit_log ON public.audit_logs;
CREATE TRIGGER trg_notify_from_audit_log
  AFTER INSERT ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_from_audit_log();

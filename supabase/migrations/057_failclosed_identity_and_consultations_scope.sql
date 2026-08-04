-- ─── 057: fail-closed identity-хелперы (увольнение отзывает доступ) + scope консультаций ─
--
-- Блокер [P1]: RLS-хелперы искали сотрудника только по user_id, без учёта deleted_at/status.
-- После увольнения (archiveEmployee/dismiss_employee только архивируют строку) прямой Data API
-- под старым JWT продолжал видеть данные: get_my_role/employee_id/department_id возвращали
-- значения архивированного, а get_my_permission_level при отсутствии активной строки отдавал
-- 'employee' (fail-OPEN). Server Actions защищены getActor() (там проверка status/deleted_at),
-- но прямой REST идёт через эти хелперы.
--
-- Свип по всем SECDEF-функциям, читающим public.employees по auth.uid(): таких ровно четыре —
-- все четыре ниже. Других identity-хелперов с этой проблемой нет.
--
-- Активным считаем: deleted_at IS NULL AND status IN ('active','probation') (домен status —
-- active/probation/archived). Архивированный/удалённый → NULL из каждого хелпера → все
-- RLS-политики fail-closed отдают ноль строк.

CREATE OR REPLACE FUNCTION public.get_my_employee_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT id FROM public.employees
  WHERE user_id = auth.uid() AND deleted_at IS NULL AND status IN ('active','probation')
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT role FROM public.employees
  WHERE user_id = auth.uid() AND deleted_at IS NULL AND status IN ('active','probation')
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_my_department_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT department_id FROM public.employees
  WHERE user_id = auth.uid() AND deleted_at IS NULL AND status IN ('active','probation')
  LIMIT 1;
$$;

-- get_my_permission_level: те же условия + БЕЗ COALESCE('employee') — при отсутствии активного
-- сотрудника возвращаем NULL (fail-closed). Все роли в roles имеют permission_level, поэтому
-- снятие COALESCE не затрагивает живых пользователей (только архив/несуществующий → NULL).
CREATE OR REPLACE FUNCTION public.get_my_permission_level()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT r.permission_level
  FROM public.employees e
  JOIN public.roles r ON r.name = e.role AND r.deleted_at IS NULL
  WHERE e.user_id = auth.uid() AND e.deleted_at IS NULL AND e.status IN ('active','probation')
  LIMIT 1;
$$;

-- ══ Консультации: привести RLS к RBAC (NOTE Codex #6) ══════════════════════════
-- permissions: mp/lmai.consultations.scope='all', can_view=true — по бизнес-правилу
-- «клиент общий» менеджеры видят ВСЕ записи, а не только свои. RLS же (007/041) держала
-- mp/lmai на manager_id=self. Приводим RLS к праву: mp/lmai → все неудалённые. targetolog
-- (permission_level='employee', но consultations.can_view=false) доступа НЕ получает —
-- поэтому политику делаем по РОЛИ (mp/lmai), а не по permission_level='employee'.
-- owner (056) и rop-team (dept_head_perm) — без изменений.
DROP POLICY IF EXISTS consultations_select_self          ON public.consultations;
DROP POLICY IF EXISTS consultations_select_employee_perm ON public.consultations;
CREATE POLICY consultations_select_managers ON public.consultations FOR SELECT TO authenticated
  USING (public.get_my_role() = ANY (ARRAY['mp','lmai']) AND deleted_at IS NULL);

-- ══ get_consultation_audit: единый scoped-запрос (устраняет read-TOCTOU, NOTE #8) ══
-- Раньше getConsultationAuditLog делал loadOwnership, затем ОТДЕЛЬНЫМ запросом читал журнал —
-- окно между проверкой владения и чтением. Здесь проверка охвата и чтение — в ОДНОМ снимке:
-- join журнала к консультации + _manager_in_scope по manager_id. Вне охвата → ноль строк.
CREATE OR REPLACE FUNCTION public.get_consultation_audit(
  p_consultation_id     uuid,
  p_actor_employee_id   uuid,
  p_actor_scope         text,
  p_actor_department_id uuid
)
RETURNS TABLE(id uuid, action text, changes jsonb, created_at timestamptz, changed_by_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT al.id, al.action, al.changes, al.created_at, e.name
  FROM public.consultation_audit_log al
  JOIN public.consultations c ON c.id = al.consultation_id
  LEFT JOIN public.employees e ON e.id = al.changed_by
  WHERE al.consultation_id = p_consultation_id
    AND public._manager_in_scope(c.manager_id, p_actor_employee_id, p_actor_scope, p_actor_department_id)
  ORDER BY al.created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.get_consultation_audit(uuid, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_consultation_audit(uuid, uuid, text, uuid) TO service_role;

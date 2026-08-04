-- ─── 047: ссылочная целостность ролей на уровне БД + блокировка строки в аудите ─
--
-- ПРОБЛЕМА (блокер ревью Codex, fail-open / TOCTOU).
-- deleteRole() в src/actions/settings.ts проверяет зависимости запросами, а затем
-- отдельным запросом делает DELETE. Между проверкой и удалением есть окно, в котором
-- можно создать или восстановить сотрудника на этой роли либо завести
-- kpi_role_settings — и роль всё равно удалится, оставив висячие ссылки.
-- employees.role и kpi_role_settings.role_name ссылались на roles.name СТРОКОЙ,
-- без внешнего ключа, поэтому БД такую гонку не удерживала.
--
-- Последствие висячей ссылки не косметическое: getPermissionRow() (src/lib/authz.ts)
-- не находит роль и fail-closed запрещает сотруднику вообще всё.
--
-- РЕШЕНИЕ. Внешние ключи с ON DELETE RESTRICT — единственная атомарная гарантия:
-- проверка ссылок и удаление происходят в одной операции внутри БД, гонку выиграть
-- нельзя. Проверки в коде остаются ради понятных сообщений, FK — последний рубеж.
--
-- ON UPDATE CASCADE: roles.name сейчас не переименовывается приложением (updateRole
-- меняет только label/permission_level), но если это когда-нибудь потребуется —
-- ссылки должны переехать сами, а не заблокировать переименование.

-- ─── 0. Самопроверка перед добавлением FK ─────────────────────────────────────
-- На staging и prod сирот нет (проверено перед написанием миграции). Но если
-- к моменту применения они появятся, ALTER TABLE упал бы с невнятной ошибкой —
-- здесь падаем осмысленно и показываем, что именно битое.

DO $$
DECLARE
  v_emp text;
  v_kpi text;
BEGIN
  SELECT string_agg(DISTINCT e.role, ', ') INTO v_emp
  FROM public.employees e
  WHERE e.role IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.roles r WHERE r.name = e.role);

  SELECT string_agg(DISTINCT k.role_name, ', ') INTO v_kpi
  FROM public.kpi_role_settings k
  WHERE k.role_name IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.roles r WHERE r.name = k.role_name);

  IF v_emp IS NOT NULL OR v_kpi IS NOT NULL THEN
    RAISE EXCEPTION
      'orphan_role_references: перед добавлением FK нужно починить битые ссылки. employees.role: [%]; kpi_role_settings.role_name: [%]',
      COALESCE(v_emp, '—'), COALESCE(v_kpi, '—');
  END IF;
END;
$$;

-- ─── 1. FK employees.role → roles.name ────────────────────────────────────────

ALTER TABLE public.employees
  DROP CONSTRAINT IF EXISTS employees_role_fkey;

ALTER TABLE public.employees
  ADD CONSTRAINT employees_role_fkey
  FOREIGN KEY (role) REFERENCES public.roles(name)
  ON UPDATE CASCADE
  ON DELETE RESTRICT;

COMMENT ON CONSTRAINT employees_role_fkey ON public.employees IS
  'Роль с привязанными сотрудниками (включая архивных) физически нельзя удалить — '
  'атомарная замена проверок в коде, закрывает TOCTOU (миграция 047).';

-- ─── 2. FK kpi_role_settings.role_name → roles.name ───────────────────────────

ALTER TABLE public.kpi_role_settings
  DROP CONSTRAINT IF EXISTS kpi_role_settings_role_name_fkey;

ALTER TABLE public.kpi_role_settings
  ADD CONSTRAINT kpi_role_settings_role_name_fkey
  FOREIGN KEY (role_name) REFERENCES public.roles(name)
  ON UPDATE CASCADE
  ON DELETE RESTRICT;

COMMENT ON CONSTRAINT kpi_role_settings_role_name_fkey ON public.kpi_role_settings IS
  'Роль с настройками KPI физически нельзя удалить (миграция 047).';

-- ─── 3. dismiss_employee: снимок «до» под блокировкой строки (P2) ─────────────
-- Раньше снимок читался без блокировки: параллельное редактирование между SELECT
-- и UPDATE делало old_data в аудите неактуальным. FOR UPDATE держит строку до конца
-- транзакции, поэтому в журнал попадает ровно то состояние, которое мы архивируем.
-- Остальная логика без изменений (см. 046).

CREATE OR REPLACE FUNCTION public.dismiss_employee(
  p_employee_id uuid,
  p_actor_id    uuid,
  p_reason      text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_before jsonb;
  v_rows   int;
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
BEGIN
  -- FOR UPDATE прямо на строке employees: строится jsonb-снимок и одновременно
  -- берётся блокировка. Через подзапрос (FROM (SELECT ...) t) это невозможно —
  -- FOR UPDATE к подзапросу неприменим.
  SELECT jsonb_build_object(
           'name',          e.name,
           'email',         e.email,
           'role',          e.role,
           'department_id', e.department_id,
           'status',        e.status
         )
    INTO v_before
  FROM public.employees e
  WHERE e.id = p_employee_id
    AND e.deleted_at IS NULL
  FOR UPDATE;

  IF v_before IS NULL THEN
    RETURN false;   -- нет такого сотрудника либо он уже уволен
  END IF;

  UPDATE public.employees
  SET    deleted_at       = now(),
         status           = 'archived',
         dismissal_reason = v_reason,
         updated_at       = now()
  WHERE  id = p_employee_id
    AND  deleted_at IS NULL;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RETURN false;
  END IF;

  -- action ограничен CHECK-списком audit_logs (create/update/delete/login/logout/
  -- export/view): увольнение — мягкое удаление, конкретика в new_data.event.
  INSERT INTO public.audit_logs (employee_id, action, resource_type, resource_id, old_data, new_data)
  VALUES (
    p_actor_id, 'delete', 'employee', p_employee_id,
    v_before,
    jsonb_build_object(
      'event', 'employee_dismissed',
      'status', 'archived',
      'dismissal_reason', v_reason
    )
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.dismiss_employee(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dismiss_employee(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.dismiss_employee(uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.dismiss_employee(uuid, uuid, text) TO service_role;

COMMENT ON FUNCTION public.dismiss_employee(uuid, uuid, text) IS
  'Атомарное увольнение: архивирование + audit_logs в одной транзакции, снимок old_data '
  'под FOR UPDATE. false — сотрудник не найден или уже уволен (миграции 046, 047).';

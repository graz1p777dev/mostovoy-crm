-- ─── 088: больничный через подмену + увольнение ───────────────────────────────

-- ══ ЧАСТЬ 1. Больничный ═══════════════════════════════════════════════════════
--
-- Больничный не заявляется сотрудником никогда. Он появляется только тогда, когда
-- вышедший коллега отмечает подмену и указывает причину «болезнь». По дню за раз:
-- владелец сознательно отказался от оформления периода вперёд — человек может
-- сказать «болею три дня», а на четвёртый всё ещё болеть, и заранее проставленный
-- период оказался бы неправдой. Каждый день подтверждает тот, кто реально вышел.

CREATE OR REPLACE FUNCTION public.register_substitution(
  p_actor uuid, p_covering_for uuid, p_reason text, p_reason_type text DEFAULT 'other'
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_emp record; v_cov record; v_covered_day record;
  v_today date := public._company_today();
  v_local timestamp := (now() AT TIME ZONE 'Asia/Bishkek');
  v_minutes int := extract(hour from v_local)::int * 60 + extract(minute from v_local)::int;
  v_sick_marked boolean := false;
  v_sick_skipped text := NULL;
BEGIN
  PERFORM public._assert_actor_active(p_actor);

  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RETURN jsonb_build_object('status','error','reason','reason_required');
  END IF;
  IF p_reason_type IS NULL OR p_reason_type NOT IN ('illness','personal','other') THEN
    RETURN jsonb_build_object('status','error','reason','bad_reason_type');
  END IF;
  IF p_covering_for = p_actor THEN
    RETURN jsonb_build_object('status','error','reason','self_substitution');
  END IF;

  SELECT id, work_start_time, work_end_time, attendance_tracked, department_id
    INTO v_emp FROM public.employees
   WHERE id = p_actor AND deleted_at IS NULL AND status = 'active';
  IF v_emp.id IS NULL OR NOT v_emp.attendance_tracked THEN
    RETURN jsonb_build_object('status','error','reason','not_tracked');
  END IF;

  SELECT id, department_id, work_start_time, work_end_time
    INTO v_cov FROM public.employees
   WHERE id = p_covering_for AND deleted_at IS NULL;
  IF v_cov.id IS NULL THEN
    RETURN jsonb_build_object('status','error','reason','covered_not_found');
  END IF;
  IF v_cov.department_id IS DISTINCT FROM v_emp.department_id THEN
    RETURN jsonb_build_object('status','error','reason','other_department');
  END IF;
  IF v_minutes < 360 THEN
    RETURN jsonb_build_object('status','error','reason','outside_window');
  END IF;
  IF EXISTS (SELECT 1 FROM public.attendance WHERE employee_id = p_actor AND date = v_today) THEN
    RETURN jsonb_build_object('status','error','reason','already_marked');
  END IF;

  INSERT INTO public.attendance (
    employee_id, date, status, check_in_time, check_in_source,
    planned_start, planned_end, late_minutes, late_grade, counts_as_worked,
    covering_for_employee_id, substitution_reason, substitution_reason_type, marked_by
  ) VALUES (
    p_actor, v_today, 'worked', now(), 'app',
    v_emp.work_start_time, v_emp.work_end_time,
    0, 'on_time', true,
    p_covering_for, trim(p_reason), p_reason_type, NULL
  );

  -- ── Больничный замещаемому ──────────────────────────────────────────────────
  IF p_reason_type = 'illness' THEN
    SELECT * INTO v_covered_day FROM public.attendance
     WHERE employee_id = p_covering_for AND date = v_today;

    IF v_covered_day.id IS NULL THEN
      -- строки нет — создаём больничный
      INSERT INTO public.attendance (
        employee_id, date, status, check_in_source,
        planned_start, planned_end, late_minutes, late_grade, counts_as_worked, marked_by
      ) VALUES (
        p_covering_for, v_today, 'sick', 'auto_system',
        COALESCE(v_cov.work_start_time,'10:00'), COALESCE(v_cov.work_end_time,'21:00'),
        0, 'on_time', false, NULL
      );
      v_sick_marked := true;

    ELSIF v_covered_day.check_in_time IS NOT NULL THEN
      -- ПРИНЦИПИАЛЬНО: человек отметился сам — подменяющий не может переписать
      -- факт его присутствия. Противоречие разбирает владелец.
      v_sick_skipped := 'covered_already_checked_in';

    ELSIF v_covered_day.status = 'absent' THEN
      -- автопрогул превращается в больничный, со следом в журнале правок
      UPDATE public.attendance
         SET status = 'sick', counts_as_worked = false, updated_at = now()
       WHERE id = v_covered_day.id;

      INSERT INTO public.attendance_corrections
        (attendance_id, corrected_by, comment, old_values, new_values)
      VALUES (
        v_covered_day.id, p_actor,
        'Больничный отмечен при подмене: ' || trim(p_reason),
        jsonb_build_object('status', v_covered_day.status,
                           'counts_as_worked', v_covered_day.counts_as_worked),
        jsonb_build_object('status','sick','counts_as_worked', false)
      );
      v_sick_marked := true;

    ELSE
      v_sick_skipped := 'covered_day_has_other_status';
    END IF;
  END IF;

  RETURN jsonb_build_object('status','ok',
    'sick_marked', v_sick_marked,
    'sick_skipped', v_sick_skipped);
END;
$$;

REVOKE ALL ON FUNCTION public.register_substitution(uuid,uuid,text,text) FROM public;
DROP FUNCTION IF EXISTS public.register_substitution(uuid,uuid,text);


-- ══ ЧАСТЬ 2. Увольнение: обрыв уже открытых сессий ═══════════════════════════
--
-- ВАЖНО: увольнение в системе уже есть и работает — RPC dismiss_employee
-- (миграция 046, уточнена в 057) и экшен archiveEmployee. Он уже: архивирует,
-- проставляет deleted_at, пишет аудит одной транзакцией, а экшен следом БАНИТ
-- учётную запись через auth.admin (ban_duration). Поэтому здесь НЕ создаётся
-- вторая функция — расширяется существующая, с сохранением её сигнатуры
-- (p_employee_id, p_actor_id, p_reason) и типа возврата boolean, иначе
-- src/actions/employees.ts:250 перестал бы её находить.
--
-- ЧЕГО НЕ ХВАТАЛО. Бан не даёт ОБНОВИТЬ сессию, но уже выданный access-токен
-- живёт до истечения. Владелец потребовал обрывать и открытые сессии, поэтому
-- добавляется удаление строк из auth.sessions и auth.refresh_tokens — после
-- этого обновить сессию нечем, а middleware на каждый запрос спрашивает сервер
-- авторизации (auth.getUser), а не разбирает токен локально, и забаненный
-- получает отказ на первом же переходе.
--
-- ЧТО ЕЩЁ ДОБАВЛЕНО: дата увольнения, снятие с учёта посещаемости и отмена
-- незакрытых заявок на отпуск.
--
-- Система никого не увольняет сама: функция вызывается только действием человека
-- с правом owner (проверка в archiveEmployee). Счётчики лишь сигналят.

CREATE OR REPLACE FUNCTION public.dismiss_employee(
  p_employee_id uuid, p_actor_id uuid, p_reason text
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_before   jsonb;
  v_rows     int;
  v_reason   text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_user_id  uuid;
  v_sessions int := 0;
  v_tokens   int := 0;
  v_vacations int := 0;
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
         ), e.user_id
    INTO v_before, v_user_id
  FROM public.employees e
  WHERE e.id = p_employee_id
    AND e.deleted_at IS NULL
  FOR UPDATE;

  IF v_before IS NULL THEN
    RETURN false;   -- нет такого сотрудника либо он уже уволен
  END IF;

  UPDATE public.employees
  SET    deleted_at         = now(),
         status             = 'archived',
         dismissal_reason   = v_reason,
         dismissed_at       = now(),
         attendance_tracked = false,
         updated_at         = now()
  WHERE  id = p_employee_id
    AND  deleted_at IS NULL;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RETURN false;
  END IF;

  -- Незакрытые заявки на отпуск теряют смысл.
  UPDATE public.vacation_requests
     SET status = 'cancelled',
         decided_by = p_actor_id,
         decided_at = now(),
         decision_comment = 'Отменено при увольнении'
   WHERE employee_id = p_employee_id AND status = 'pending';
  GET DIAGNOSTICS v_vacations = ROW_COUNT;

  -- Обрыв уже открытых сессий. Бан (его ставит archiveEmployee через auth.admin)
  -- закрывает вход и обновление; это закрывает то, что уже открыто.
  IF v_user_id IS NOT NULL THEN
    DELETE FROM auth.refresh_tokens WHERE user_id = v_user_id::text;
    GET DIAGNOSTICS v_tokens = ROW_COUNT;
    DELETE FROM auth.sessions WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_sessions = ROW_COUNT;
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
      'dismissal_reason', v_reason,
      'sessions_terminated', v_sessions,
      'tokens_revoked', v_tokens,
      'vacations_cancelled', v_vacations
    )
  );

  RETURN true;
END;
$function$;

COMMENT ON FUNCTION public.dismiss_employee(uuid,uuid,text) IS
  'Увольнение одной транзакцией: архив, deleted_at, дата увольнения, снятие с '
  'учёта посещаемости, отмена заявок на отпуск, обрыв открытых сессий и токенов, '
  'аудит. Бан учётной записи ставит вызывающий экшен через auth.admin. '
  'Данные не удаляются. Автоматики нет: вызывается только действием владельца.';

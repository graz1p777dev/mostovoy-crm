-- ─── 087: отпуска ─────────────────────────────────────────────────────────────
--
-- Правила владельца: отпуск неоплачиваемый; стаж от 6 месяцев; 14 календарных
-- дней в год; один период на полугодие, не более 7 дней; заявка минимум за 7 дней;
-- между периодами реальный разрыв — 30 календарных дней.
--
-- ГДЕ ЧТО ПРОВЕРЯЕТСЯ. Главные лимиты вынесены в схему, а не в код:
--   7 дней за период        → CHECK, нарушить нельзя в принципе
--   один период на полугодие → UNIQUE-индекс, нарушить нельзя в принципе
--   отказ без комментария    → CHECK
--   14 дней в год            → следствие двух первых (7 + 7)
-- Стаж, срок подачи и разрыв — в функции подачи: они зависят от «сегодня».
--
-- ЗАЩИТА ОТ СКЛЕЙКИ. Схема обхода: взять дни в конце первого полугодия и
-- продолжить в начале второго, получив 14 подряд. Закрыто двумя правилами:
--   1) период не может пересекать границу полугодия — иначе склейка делалась бы
--      одной заявкой и правило «один период на полугодие» её бы не поймало;
--   2) между концом одобренного периода и началом следующего — минимум 30 дней.

CREATE TABLE IF NOT EXISTS public.vacation_requests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id      uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  date_from        date NOT NULL,
  date_to          date NOT NULL,
  days_count       integer NOT NULL,
  period_key       text NOT NULL,
  status           text NOT NULL DEFAULT 'pending',
  employee_comment text,
  decided_by       uuid REFERENCES public.employees(id),
  decided_at       timestamptz,
  decision_comment text,
  created_by_owner boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT vacation_dates_order CHECK (date_to >= date_from),
  CONSTRAINT vacation_days_limit  CHECK (days_count BETWEEN 1 AND 7),
  CONSTRAINT vacation_status_check CHECK (status IN ('pending','approved','rejected','cancelled')),
  -- отказ обязан быть объяснён
  CONSTRAINT vacation_reject_needs_comment CHECK (
    status <> 'rejected'
    OR (decision_comment IS NOT NULL AND length(trim(decision_comment)) > 0)
  ),
  -- период не пересекает границу полугодия
  CONSTRAINT vacation_within_one_half CHECK (
    date_part('year', date_from) = date_part('year', date_to)
    AND (date_part('month', date_from) <= 6) = (date_part('month', date_to) <= 6)
  )
);

-- Один ОДОБРЕННЫЙ период на полугодие. Отклонённые и отменённые не мешают.
CREATE UNIQUE INDEX IF NOT EXISTS ux_vacation_one_per_half
  ON public.vacation_requests (employee_id, period_key)
  WHERE status = 'approved';

CREATE INDEX IF NOT EXISTS idx_vacation_emp_status
  ON public.vacation_requests (employee_id, status, date_from DESC);

ALTER TABLE public.vacation_requests ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.vacation_requests FROM authenticated, anon;

-- Сотрудник видит свои заявки; согласующий — по своей области права 'vacations'.
DROP POLICY IF EXISTS vacation_requests_select ON public.vacation_requests;
CREATE POLICY vacation_requests_select ON public.vacation_requests
  FOR SELECT TO authenticated
  USING (
    employee_id = (SELECT public.get_my_employee_id())
    OR (SELECT public._my_perm_scope('vacations')) = 'all'
    OR ((SELECT public._my_perm_scope('vacations')) = 'team'
        AND employee_id IN (SELECT public._my_dept_employee_ids()))
  );

-- ── Право 'vacations' ─────────────────────────────────────────────────────────
-- Отдельный ресурс, а не привязка к attendance: согласование отпусков делегируется
-- независимо. Сейчас выдаём только владельцу; когда появится руководитель отдела,
-- право выдаётся ему без правки кода.
INSERT INTO public.permissions (role_id, resource, can_view, can_create, can_edit, can_delete, scope)
SELECT r.id, 'vacations', true, true, true, true, 'all'
FROM public.roles r WHERE r.name = 'owner' AND r.deleted_at IS NULL
ON CONFLICT (role_id, resource) DO NOTHING;

-- Остальным ролям — только просмотр своих (scope='own'), без согласования.
INSERT INTO public.permissions (role_id, resource, can_view, can_create, can_edit, can_delete, scope)
SELECT r.id, 'vacations', true, true, false, false, 'own'
FROM public.roles r
WHERE r.deleted_at IS NULL AND r.name <> 'owner'
ON CONFLICT (role_id, resource) DO NOTHING;

-- ── Ключ полугодия ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._half_year_key(p_date date)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT to_char(p_date, 'YYYY') || '-H' ||
         CASE WHEN date_part('month', p_date) <= 6 THEN '1' ELSE '2' END;
$$;

-- ── Подача заявки сотрудником ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_vacation_request(
  p_actor uuid, p_from date, p_to date, p_comment text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_emp record;
  v_today date := public._company_today();
  v_days int := (p_to - p_from) + 1;   -- КАЛЕНДАРНЫЕ дни включительно
  v_key text := public._half_year_key(p_from);
  v_prev_end date;
  v_next_start date;
BEGIN
  PERFORM public._assert_actor_active(p_actor);

  SELECT id, hire_date, attendance_tracked INTO v_emp
  FROM public.employees WHERE id = p_actor AND deleted_at IS NULL AND status = 'active';
  IF v_emp.id IS NULL THEN
    RETURN jsonb_build_object('status','error','reason','employee_not_found');
  END IF;

  IF p_to < p_from THEN
    RETURN jsonb_build_object('status','error','reason','dates_order');
  END IF;

  -- Стаж не менее 6 месяцев на дату НАЧАЛА отпуска. Тихо обойти нельзя:
  -- проверка здесь, а не в форме.
  IF v_emp.hire_date IS NULL THEN
    RETURN jsonb_build_object('status','error','reason','no_hire_date');
  END IF;
  IF p_from < (v_emp.hire_date + interval '6 months')::date THEN
    RETURN jsonb_build_object('status','error','reason','tenure_too_short',
      'eligible_from', (v_emp.hire_date + interval '6 months')::date);
  END IF;

  IF v_days > 7 THEN
    RETURN jsonb_build_object('status','error','reason','too_many_days','days', v_days);
  END IF;

  -- Период не пересекает границу полугодия (дублирует CHECK — чтобы вернуть
  -- понятную причину, а не нарушение констрейнта).
  IF public._half_year_key(p_from) <> public._half_year_key(p_to) THEN
    RETURN jsonb_build_object('status','error','reason','crosses_half_year');
  END IF;

  -- Заявка минимум за 7 календарных дней.
  IF p_from < v_today + 7 THEN
    RETURN jsonb_build_object('status','error','reason','too_late','earliest', v_today + 7);
  END IF;

  -- Один период на полугодие (одобренный или ещё ждущий решения).
  IF EXISTS (SELECT 1 FROM public.vacation_requests
              WHERE employee_id = p_actor AND period_key = v_key
                AND status IN ('approved','pending')) THEN
    RETURN jsonb_build_object('status','error','reason','half_year_taken','period', v_key);
  END IF;

  -- Разрыв 30 календарных дней от ближайшего одобренного периода с любой стороны.
  SELECT max(date_to) INTO v_prev_end FROM public.vacation_requests
   WHERE employee_id = p_actor AND status = 'approved' AND date_to < p_from;
  IF v_prev_end IS NOT NULL AND (p_from - v_prev_end) < 30 THEN
    RETURN jsonb_build_object('status','error','reason','gap_too_small',
      'gap_days', (p_from - v_prev_end), 'required', 30);
  END IF;

  SELECT min(date_from) INTO v_next_start FROM public.vacation_requests
   WHERE employee_id = p_actor AND status = 'approved' AND date_from > p_to;
  IF v_next_start IS NOT NULL AND (v_next_start - p_to) < 30 THEN
    RETURN jsonb_build_object('status','error','reason','gap_too_small',
      'gap_days', (v_next_start - p_to), 'required', 30);
  END IF;

  INSERT INTO public.vacation_requests
    (employee_id, date_from, date_to, days_count, period_key, status, employee_comment)
  VALUES (p_actor, p_from, p_to, v_days, v_key, 'pending', NULLIF(trim(COALESCE(p_comment,'')), ''));

  RETURN jsonb_build_object('status','ok','days', v_days,'period', v_key);
END;
$$;

-- ── Материализация одобренного отпуска в табель ───────────────────────────────
-- Строки создаются только на РАБОЧИЕ по графику дни: выходной внутри отпуска
-- отпуском не является. Дни, где уже есть запись, не трогаем — автопрогул или
-- фактический выход важнее.
CREATE OR REPLACE FUNCTION public._materialize_vacation(p_request_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record; v_emp record; d date; v_count int := 0;
BEGIN
  SELECT * INTO r FROM public.vacation_requests WHERE id = p_request_id;
  IF r.id IS NULL OR r.status <> 'approved' THEN RETURN 0; END IF;

  SELECT id, work_start_time, work_end_time, schedule_type, schedule_anchor_date, hire_date
    INTO v_emp FROM public.employees WHERE id = r.employee_id;

  d := r.date_from;
  WHILE d <= r.date_to LOOP
    IF public._is_work_day(d, COALESCE(v_emp.schedule_type,'5/2'),
                           COALESCE(v_emp.schedule_anchor_date, v_emp.hire_date))
       AND NOT EXISTS (SELECT 1 FROM public.attendance
                        WHERE employee_id = r.employee_id AND date = d) THEN
      INSERT INTO public.attendance (
        employee_id, date, status, check_in_source,
        planned_start, planned_end, late_minutes, late_grade, counts_as_worked, marked_by
      ) VALUES (
        r.employee_id, d, 'vacation', 'auto_system',
        COALESCE(v_emp.work_start_time,'10:00'), COALESCE(v_emp.work_end_time,'21:00'),
        0, 'on_time', false, r.decided_by
      );
      v_count := v_count + 1;
    END IF;
    d := d + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ── Решение по заявке ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.decide_vacation_request(
  p_actor uuid, p_request_id uuid, p_approve boolean, p_comment text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_scope text; r record; v_actor_dept uuid; v_made int;
BEGIN
  PERFORM public._assert_actor_active(p_actor);

  v_scope := public._perm_scope_for(p_actor, 'vacations');
  IF v_scope IS NULL OR v_scope NOT IN ('team','all') THEN
    RETURN jsonb_build_object('status','error','reason','forbidden');
  END IF;

  SELECT * INTO r FROM public.vacation_requests WHERE id = p_request_id;
  IF r.id IS NULL THEN
    RETURN jsonb_build_object('status','error','reason','not_found');
  END IF;
  IF r.status <> 'pending' THEN
    RETURN jsonb_build_object('status','error','reason','already_decided','current', r.status);
  END IF;

  IF v_scope = 'team' THEN
    SELECT department_id INTO v_actor_dept FROM public.employees WHERE id = p_actor;
    IF NOT EXISTS (SELECT 1 FROM public.employees
                    WHERE id = r.employee_id AND department_id = v_actor_dept) THEN
      RETURN jsonb_build_object('status','error','reason','out_of_scope');
    END IF;
  END IF;

  -- Отказ без объяснения не пройдёт и по CHECK, но вернём понятную причину.
  IF NOT p_approve AND (p_comment IS NULL OR length(trim(p_comment)) = 0) THEN
    RETURN jsonb_build_object('status','error','reason','comment_required');
  END IF;

  UPDATE public.vacation_requests
     SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
         decided_by = p_actor,
         decided_at = now(),
         decision_comment = NULLIF(trim(COALESCE(p_comment,'')), '')
   WHERE id = p_request_id;

  IF p_approve THEN
    v_made := public._materialize_vacation(p_request_id);
  ELSE
    v_made := 0;
  END IF;

  INSERT INTO public.notifications (employee_id, type, title, body, source_type, source_id, is_important)
  VALUES (r.employee_id, 'system',
          CASE WHEN p_approve THEN 'Отпуск согласован' ELSE 'Отпуск отклонён' END,
          to_char(r.date_from,'DD.MM.YYYY')||'–'||to_char(r.date_to,'DD.MM.YYYY')
            || COALESCE(' · '||NULLIF(trim(COALESCE(p_comment,'')),''), ''),
          'vacation', p_request_id, NOT p_approve);

  RETURN jsonb_build_object('status','ok','days_marked', v_made);
END;
$$;

-- ── Оформление задним числом владельцем ───────────────────────────────────────
-- Сотруднику задним числом нельзя, владельцу можно — с обязательным комментарием,
-- как у любой другой правки. Ограничения по стажу и по одному периоду на
-- полугодие сохраняются: задним числом обходить лимиты тоже нельзя.
CREATE OR REPLACE FUNCTION public.register_vacation_retroactive(
  p_actor uuid, p_employee_id uuid, p_from date, p_to date, p_comment text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_scope text; v_emp record; v_days int := (p_to - p_from) + 1;
  v_key text := public._half_year_key(p_from); v_id uuid; v_made int;
BEGIN
  PERFORM public._assert_actor_active(p_actor);

  v_scope := public._perm_scope_for(p_actor, 'vacations');
  IF v_scope IS NULL OR v_scope NOT IN ('team','all') THEN
    RETURN jsonb_build_object('status','error','reason','forbidden');
  END IF;

  IF p_comment IS NULL OR length(trim(p_comment)) = 0 THEN
    RETURN jsonb_build_object('status','error','reason','comment_required');
  END IF;
  IF p_to < p_from THEN
    RETURN jsonb_build_object('status','error','reason','dates_order');
  END IF;
  IF v_days > 7 THEN
    RETURN jsonb_build_object('status','error','reason','too_many_days','days', v_days);
  END IF;
  IF public._half_year_key(p_from) <> public._half_year_key(p_to) THEN
    RETURN jsonb_build_object('status','error','reason','crosses_half_year');
  END IF;

  SELECT id, hire_date INTO v_emp FROM public.employees
   WHERE id = p_employee_id AND deleted_at IS NULL;
  IF v_emp.id IS NULL THEN
    RETURN jsonb_build_object('status','error','reason','employee_not_found');
  END IF;
  IF v_emp.hire_date IS NULL OR p_from < (v_emp.hire_date + interval '6 months')::date THEN
    RETURN jsonb_build_object('status','error','reason','tenure_too_short');
  END IF;

  IF EXISTS (SELECT 1 FROM public.vacation_requests
              WHERE employee_id = p_employee_id AND period_key = v_key
                AND status IN ('approved','pending')) THEN
    RETURN jsonb_build_object('status','error','reason','half_year_taken','period', v_key);
  END IF;

  INSERT INTO public.vacation_requests
    (employee_id, date_from, date_to, days_count, period_key, status,
     decided_by, decided_at, decision_comment, created_by_owner)
  VALUES (p_employee_id, p_from, p_to, v_days, v_key, 'approved',
          p_actor, now(), trim(p_comment), true)
  RETURNING id INTO v_id;

  v_made := public._materialize_vacation(v_id);

  RETURN jsonb_build_object('status','ok','request_id', v_id, 'days_marked', v_made);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_vacation_request(uuid,date,date,text) FROM public;
REVOKE ALL ON FUNCTION public.decide_vacation_request(uuid,uuid,boolean,text) FROM public;
REVOKE ALL ON FUNCTION public.register_vacation_retroactive(uuid,uuid,date,date,text) FROM public;

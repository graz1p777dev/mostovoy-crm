-- ─── 085: объяснительные — таблица, бакет и доступ к файлам ───────────────────
--
-- Рукописная объяснительная нужна при опоздании СВЫШЕ 15 минут (при 5–15 хватает
-- причины, записанной в момент прихода, — миграция 086). Система ничего не решает
-- сама: она показывает, кто должен и кто сдал, а меры принимает владелец.
--
-- ДОЛГ НИГДЕ НЕ ХРАНИТСЯ. «Кто должен» — это дни с опозданием свыше 15 минут, у
-- которых нет строки здесь. Хранимый список разъехался бы с фактами после первой
-- же правки задним числом — та же логика, что со счётчиками в фазе 1.

CREATE TABLE IF NOT EXISTS public.attendance_explanations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_id uuid NOT NULL UNIQUE REFERENCES public.attendance(id) ON DELETE CASCADE,
  employee_id   uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  storage_path  text NOT NULL,
  mime_type     text NOT NULL,
  size_bytes    integer NOT NULL,
  uploaded_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_explanations_mime_check CHECK (
    mime_type IN ('image/jpeg','image/png','image/webp','image/heic')
  ),
  CONSTRAINT attendance_explanations_size_check CHECK (
    size_bytes > 0 AND size_bytes <= 5242880   -- 5 МБ
  )
);

CREATE INDEX IF NOT EXISTS idx_attendance_explanations_emp
  ON public.attendance_explanations (employee_id, uploaded_at DESC);

-- ── Доступ к записям ──────────────────────────────────────────────────────────
ALTER TABLE public.attendance_explanations ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.attendance_explanations FROM authenticated, anon;

-- Сотрудник видит только свои; управляющий — по своей области.
DROP POLICY IF EXISTS attendance_explanations_select ON public.attendance_explanations;
CREATE POLICY attendance_explanations_select ON public.attendance_explanations
  FOR SELECT TO authenticated
  USING (
    employee_id = (SELECT public.get_my_employee_id())
    OR (SELECT public._my_perm_scope('attendance')) = 'all'
    OR ((SELECT public._my_perm_scope('attendance')) = 'team'
        AND employee_id IN (SELECT public._my_dept_employee_ids()))
  );

-- ── Бакет ─────────────────────────────────────────────────────────────────────
-- Приватный. Лимит и типы дублируют CHECK таблицы: Storage режет файл ещё до
-- того, как дело дойдёт до записи в таблицу.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('explanations', 'explanations', false, 5242880,
        ARRAY['image/jpeg','image/png','image/webp','image/heic'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = 5242880,
      allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/heic'];

-- ── Доступ к файлам ───────────────────────────────────────────────────────────
-- ВАЖНО: на storage.objects RLS включён, а политик до сих пор не было НИ ОДНОЙ —
-- то есть файлы были недоступны никому, кроме служебного ключа. Добавляю ровно
-- необходимое и только для этого бакета; остальные бакеты остаются закрытыми.
--
-- Путь: <employee_id>/<attendance_id>.<ext> — первая папка совпадает с
-- сотрудником, на этом и строится проверка.

DROP POLICY IF EXISTS explanations_select_own_or_manager ON storage.objects;
CREATE POLICY explanations_select_own_or_manager ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'explanations'
    AND (
      (storage.foldername(name))[1] = (SELECT public.get_my_employee_id())::text
      OR (SELECT public._my_perm_scope('attendance')) = 'all'
      OR ((SELECT public._my_perm_scope('attendance')) = 'team'
          AND (storage.foldername(name))[1] IN (
            SELECT id::text FROM public.employees
             WHERE id IN (SELECT public._my_dept_employee_ids())))
    )
  );

-- Загружать сотрудник может только в свою папку.
DROP POLICY IF EXISTS explanations_insert_own ON storage.objects;
CREATE POLICY explanations_insert_own ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'explanations'
    AND (storage.foldername(name))[1] = (SELECT public.get_my_employee_id())::text
  );

-- Перезаписывать и удалять сотрудник НЕ может: объяснительная — доказательство,
-- изъять его задним числом нельзя. Удаление доступно только владельцу.
DROP POLICY IF EXISTS explanations_delete_owner ON storage.objects;
CREATE POLICY explanations_delete_owner ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'explanations'
    AND (SELECT public.get_my_role()) = 'owner'
  );

-- ── Кто должен и кто сдал ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_explanation_status(
  p_actor uuid, p_year integer, p_month integer
)
RETURNS TABLE (
  attendance_id uuid,
  employee_id   uuid,
  employee_name text,
  date          date,
  late_minutes  integer,
  reason        text,
  uploaded      boolean,
  storage_path  text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_scope text; v_actor_dept uuid;
  v_from date := make_date(p_year, p_month, 1);
  v_to   date := (make_date(p_year, p_month, 1) + interval '1 month - 1 day')::date;
BEGIN
  v_scope := public._perm_scope_for(p_actor, 'attendance');
  IF v_scope IS NULL OR v_scope NOT IN ('team','all') THEN
    RETURN;   -- fail-closed
  END IF;

  SELECT department_id INTO v_actor_dept FROM public.employees WHERE id = p_actor;

  RETURN QUERY
  SELECT a.id, a.employee_id, e.name::text, a.date, a.late_minutes, a.late_reason,
         (x.id IS NOT NULL), x.storage_path
  FROM public.attendance a
  JOIN public.employees e ON e.id = a.employee_id
  LEFT JOIN public.attendance_explanations x ON x.attendance_id = a.id
  WHERE a.date BETWEEN v_from AND v_to
    -- объяснительная нужна только при опоздании свыше 15 минут
    AND a.late_grade IN ('late_hard','late_critical')
    AND (v_scope = 'all' OR e.department_id IS NOT DISTINCT FROM v_actor_dept)
  ORDER BY (x.id IS NOT NULL), a.date DESC;   -- сначала должники
END;
$$;

-- ── Регистрация загруженного файла ────────────────────────────────────────────
-- Файл кладёт сам сотрудник (политика storage выше), а строку создаёт эта
-- функция: она проверяет, что день действительно требует объяснительной и что
-- он принадлежит вызывающему.
CREATE OR REPLACE FUNCTION public.register_explanation(
  p_actor uuid, p_attendance_id uuid, p_path text, p_mime text, p_size integer
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row record;
BEGIN
  PERFORM public._assert_actor_active(p_actor);

  SELECT * INTO v_row FROM public.attendance WHERE id = p_attendance_id;
  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('status','error','reason','not_found');
  END IF;
  IF v_row.employee_id <> p_actor THEN
    RETURN jsonb_build_object('status','error','reason','not_your_record');
  END IF;
  IF v_row.late_grade NOT IN ('late_hard','late_critical') THEN
    RETURN jsonb_build_object('status','error','reason','not_required');
  END IF;
  IF EXISTS (SELECT 1 FROM public.attendance_explanations WHERE attendance_id = p_attendance_id) THEN
    RETURN jsonb_build_object('status','already');
  END IF;

  INSERT INTO public.attendance_explanations
    (attendance_id, employee_id, storage_path, mime_type, size_bytes)
  VALUES (p_attendance_id, p_actor, p_path, p_mime, p_size);

  RETURN jsonb_build_object('status','ok');
END;
$$;

REVOKE ALL ON FUNCTION public.get_explanation_status(uuid,integer,integer) FROM public;
REVOKE ALL ON FUNCTION public.register_explanation(uuid,uuid,text,text,integer) FROM public;

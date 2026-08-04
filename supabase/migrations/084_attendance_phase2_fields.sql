-- ─── 084: фаза 2, базовые поля ────────────────────────────────────────────────
--
-- Три независимых добавления, на которых стоят остальные миграции фазы 2:
--   1. employees.attendance_tracked_since — заменяет временную константу в табеле;
--   2. employees.dismissed_at — даты увольнения не было, только причина;
--   3. attendance.substitution_reason_type — структурированная причина подмены,
--      из которой берётся больничный (миграция 086).

-- ── 1. С какой даты по сотруднику ведётся учёт ────────────────────────────────
-- Табель показывает «нет отметки» (?) только для дней >= этой даты. Раньше эта
-- граница была общей константой ATTENDANCE_LIVE_FROM='2026-07-29' в коде: включение
-- учёта в августе задним числом помечало бы июль пробелами.

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS attendance_tracked_since date;

COMMENT ON COLUMN public.employees.attendance_tracked_since IS
  'С какой даты ведётся учёт посещаемости. До неё отсутствие записи ничего не '
  'означает и в табеле показывается пустой клеткой, а не пробелом.';

-- Проставляется автоматически при включении учёта. При выключении НЕ сбрасывается:
-- иначе повторное включение потеряло бы историю и старые дни снова стали бы «?».
CREATE OR REPLACE FUNCTION public._set_tracked_since()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.attendance_tracked = true
     AND COALESCE(OLD.attendance_tracked, false) = false
     AND NEW.attendance_tracked_since IS NULL THEN
    NEW.attendance_tracked_since := (now() AT TIME ZONE 'Asia/Bishkek')::date;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_employees_tracked_since ON public.employees;
CREATE TRIGGER trg_employees_tracked_since
  BEFORE INSERT OR UPDATE OF attendance_tracked ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public._set_tracked_since();

-- ── 2. Дата увольнения ────────────────────────────────────────────────────────
-- dismissal_reason уже был (004), даты не было. Нужна и для блокировки доступа,
-- и чтобы табель не красил дни после увольнения как «нет отметки».

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS dismissed_at timestamptz;

COMMENT ON COLUMN public.employees.dismissed_at IS
  'Момент увольнения. Ставится только функцией dismiss_employee (088); '
  'ни один автомат статус на archived не меняет.';

-- ── 3. Тип причины подмены ────────────────────────────────────────────────────
-- Свободный текст причины остаётся обязательным (констрейнт из 077). Тип нужен,
-- чтобы из подмены получался больничный замещаемого, не разбирая текст.

ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS substitution_reason_type text;

ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_sub_reason_type_check;
ALTER TABLE public.attendance ADD CONSTRAINT attendance_sub_reason_type_check CHECK (
  substitution_reason_type IS NULL
  OR substitution_reason_type IN ('illness','personal','other')
);

-- Тип обязателен там, где есть подмена (и наоборот — без подмены он бессмыслен).
ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_sub_type_paired;
ALTER TABLE public.attendance ADD CONSTRAINT attendance_sub_type_paired CHECK (
  (covering_for_employee_id IS NULL AND substitution_reason_type IS NULL)
  OR (covering_for_employee_id IS NOT NULL AND substitution_reason_type IS NOT NULL)
) NOT VALID;   -- NOT VALID: строки подмен из фазы 1 (если появятся) не ломаем

COMMENT ON COLUMN public.attendance.substitution_reason_type IS
  'illness | personal | other. При illness замещаемому проставляется больничный.';

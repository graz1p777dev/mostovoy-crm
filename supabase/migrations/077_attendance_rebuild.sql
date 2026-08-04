-- ─── 077: перестройка учёта посещаемости, фаза 1 (схема) ──────────────────────
--
-- ПОЧЕМУ. Аудит 2026-07-29 (docs/reports/2026-07-29-attendance-audit.md) показал, что
-- модуль построен наполовину: приход фиксируется автоматически при открытии дашборда,
-- ручной отметки нет вообще, исправить ничего нельзя, а RLS позволяет сотруднику
-- самому вписывать себе рабочие дни на любые даты (политики attendance_insert_self /
-- attendance_update_self + гранты INSERT/UPDATE роли authenticated).
--
-- ТРИ ПРИНЦИПА МОДЕЛИ (согласованы с владельцем):
--
--   1. Смена КОПИРУЕТСЯ в запись дня (planned_start/planned_end). Изменение графика
--      сотрудника завтра не переоценивает вчерашние дни: «вовремя» не станет задним
--      числом «опозданием», счётчики опозданий не поедут.
--
--   2. Недоработка и переработка — ДВЕ неотрицательные колонки, а не одно число со
--      знаком, плюс CHECK, запрещающий обеим быть положительными. Требование владельца
--      «никогда не сальдировать разные дни» защищено структурой, а не дисциплиной:
--      сложить их в одно сальдо просто нечем.
--
--   3. Писать в attendance может только сервер. Все политики записи снимаются, гранты
--      отзываются; запись идёт через SECURITY DEFINER функции (миграция 078).
--
-- ЭТА МИГРАЦИЯ — ТОЛЬКО СХЕМА. Функции — 078, realtime — 079, планировщик — 080.

-- ── 1. employees: признак учёта ───────────────────────────────────────────────
-- Круг лиц задаёт владелец вручную, а НЕ выводится из роли/permission_level.
-- Прежний код требовал permission_level='employee', из-за чего owner и rop не могли
-- отметиться, хотя attendance.can_create у них true (дефекты 7.1/7.3 аудита).
-- Умолчание false: сотрудник не попадает под учёт, пока владелец не включит явно.

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS attendance_tracked boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.employees.attendance_tracked IS
  'Ведём ли учёт посещаемости. Ставит владелец вручную; из роли НЕ выводится.';

-- Время смены персонально. Колонки уже есть (004), меняем только умолчание:
-- для новых сотрудников 10:00–21:00 вместо 09:00–18:00. Существующие строки
-- умолчание не затрагивает — владелец проставляет каждому на карточке.
ALTER TABLE public.employees ALTER COLUMN work_start_time SET DEFAULT '10:00';
ALTER TABLE public.employees ALTER COLUMN work_end_time   SET DEFAULT '21:00';

-- Учёт невозможен без явно заданной смены. NOT VALID: существующие строки не
-- проверяются (у всех сейчас attendance_tracked=false, конфликта нет), но любая
-- будущая вставка/правка обязана иметь оба времени при включённом учёте.
ALTER TABLE public.employees
  DROP CONSTRAINT IF EXISTS employees_tracked_needs_shift;
ALTER TABLE public.employees
  ADD CONSTRAINT employees_tracked_needs_shift CHECK (
    attendance_tracked = false
    OR (work_start_time IS NOT NULL AND work_end_time IS NOT NULL)
  ) NOT VALID;

-- ── 2. attendance: новые поля ─────────────────────────────────────────────────

ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS planned_start       time,
  ADD COLUMN IF NOT EXISTS planned_end         time,
  ADD COLUMN IF NOT EXISTS check_out_time      timestamptz,
  ADD COLUMN IF NOT EXISTS check_in_source     text NOT NULL DEFAULT 'app',
  ADD COLUMN IF NOT EXISTS check_out_source    text,
  ADD COLUMN IF NOT EXISTS late_grade          text NOT NULL DEFAULT 'on_time',
  ADD COLUMN IF NOT EXISTS counts_as_worked    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS worked_minutes      integer,
  ADD COLUMN IF NOT EXISTS overtime_minutes    integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shortfall_minutes   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS substitution_reason text;

COMMENT ON COLUMN public.attendance.planned_start IS
  'Снимок начала смены на этот день. Изменение графика не переоценивает прошлое.';
COMMENT ON COLUMN public.attendance.counts_as_worked IS
  'Зачтён ли день. Единый источник истины для зарплаты и норм декомпозиции: '
  'раньше salary.ts считал worked+remote, а recalculate_decomposition только worked.';
COMMENT ON COLUMN public.attendance.overtime_minutes IS
  'Переработка ЗА ЭТОТ ДЕНЬ, >=0. С shortfall_minutes несовместима (CHECK). '
  'Сальдирование между днями невозможно по построению.';
COMMENT ON COLUMN public.attendance.check_out_source IS
  'app | auto_cash_register | manual_owner. auto_cash_register — задел под товароучёт: '
  'закрытие кассы пишет то же поле, модель не меняется.';

-- is_late избыточен: полностью выводится из late_grade.
ALTER TABLE public.attendance DROP COLUMN IF EXISTS is_late;

-- ── 3. Бэкфилл существующих строк ─────────────────────────────────────────────
-- 6 строк на staging. planned_* берём из текущей смены сотрудника — для исторических
-- записей это единственный доступный ориентир; дальше он уже не переоценивается.

UPDATE public.attendance a
SET planned_start = COALESCE(e.work_start_time, '10:00'),
    planned_end   = COALESCE(e.work_end_time,   '21:00')
FROM public.employees e
WHERE e.id = a.employee_id
  AND (a.planned_start IS NULL OR a.planned_end IS NULL);

-- Статус 'worked'/'remote' исторически означал зачтённый день.
UPDATE public.attendance
SET counts_as_worked = (status IN ('worked','remote'))
WHERE counts_as_worked IS DISTINCT FROM (status IN ('worked','remote'));

-- Степень опоздания по уже записанным минутам, по согласованным границам.
UPDATE public.attendance
SET late_grade = CASE
      WHEN late_minutes <= 0  THEN 'on_time'
      WHEN late_minutes <= 5  THEN 'late_forgiven'
      WHEN late_minutes <= 15 THEN 'late_soft'
      WHEN late_minutes <= 30 THEN 'late_hard'
      ELSE 'late_critical'
    END
WHERE late_grade = 'on_time' AND late_minutes > 0;

ALTER TABLE public.attendance ALTER COLUMN planned_start SET NOT NULL;
ALTER TABLE public.attendance ALTER COLUMN planned_end   SET NOT NULL;

-- ── 4. Констрейнты ────────────────────────────────────────────────────────────

-- Статусы: приводим набор БД и TS-типа к одному. Аудит 7.3: БД разрешала 'worked',
-- а TS-union перечислял 'present'/'weekend', которых БД не принимает — из-за чего
-- точка статуса в «Команда сейчас» была серой у всех отметившихся.
-- Добавляется late_not_counted (пришёл, но опоздал более чем на 30 минут).
-- sick/vacation остаются ради существующих строк; их ведение — фаза 2.
ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_status_check;
ALTER TABLE public.attendance ADD CONSTRAINT attendance_status_check CHECK (
  status IN ('worked','late_not_counted','absent','day_off','remote','sick','vacation')
);

-- Границы опозданий (согласованы): до 5 включительно прощаем, >5..15 мягкий счётчик,
-- >15 жёсткий, >30 день не зачитывается.
ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_late_grade_check;
ALTER TABLE public.attendance ADD CONSTRAINT attendance_late_grade_check CHECK (
  late_grade IN ('on_time','late_forgiven','late_soft','late_hard','late_critical')
);

-- Причина подмены обязательна — гарантия БД, а не проверка формы.
ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_substitution_reason_required;
ALTER TABLE public.attendance ADD CONSTRAINT attendance_substitution_reason_required CHECK (
  covering_for_employee_id IS NULL
  OR (substitution_reason IS NOT NULL AND length(trim(substitution_reason)) > 0)
);

-- Ключевой инвариант: недоработка и переработка не могут сосуществовать.
ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_no_netting;
ALTER TABLE public.attendance ADD CONSTRAINT attendance_no_netting CHECK (
  NOT (overtime_minutes > 0 AND shortfall_minutes > 0)
);

ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_minutes_nonneg;
ALTER TABLE public.attendance ADD CONSTRAINT attendance_minutes_nonneg CHECK (
  overtime_minutes >= 0 AND shortfall_minutes >= 0
  AND (worked_minutes IS NULL OR worked_minutes >= 0)
);

ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_sources_check;
ALTER TABLE public.attendance ADD CONSTRAINT attendance_sources_check CHECK (
  check_in_source IN ('app','auto_system','manual_owner')
  AND (check_out_source IS NULL
       OR check_out_source IN ('app','auto_cash_register','manual_owner'))
);

-- Уход не раньше прихода.
ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_checkout_after_checkin;
ALTER TABLE public.attendance ADD CONSTRAINT attendance_checkout_after_checkin CHECK (
  check_out_time IS NULL OR check_in_time IS NULL OR check_out_time >= check_in_time
);

CREATE INDEX IF NOT EXISTS idx_attendance_open_days
  ON public.attendance (employee_id, date)
  WHERE check_in_time IS NOT NULL AND check_out_time IS NULL;

-- ── 5. Журнал правок владельца ────────────────────────────────────────────────
-- Обязательность комментария — CHECK, а не валидация формы: правка без объяснения
-- физически не запишется. Заполняется только внутри correct_attendance (078),
-- одной транзакцией с самой правкой.

CREATE TABLE IF NOT EXISTS public.attendance_corrections (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_id uuid NOT NULL REFERENCES public.attendance(id) ON DELETE CASCADE,
  corrected_by  uuid NOT NULL REFERENCES public.employees(id),
  comment       text NOT NULL,
  old_values    jsonb NOT NULL,
  new_values    jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_corrections_comment_required
    CHECK (length(trim(comment)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_attendance_corrections_att
  ON public.attendance_corrections (attendance_id, created_at DESC);

-- ── 6. Сигналы ответственному ─────────────────────────────────────────────────
-- UNIQUE(employee_id, alert_type, period_key) даёт идемпотентность: один порог за
-- один период не просигналит дважды, сколько бы раз ни пересчитывали.
-- Счётчики НИГДЕ не хранятся — считаются на лету (078). Хранимый счётчик разъедется
-- с фактами после первой же правки задним числом.

CREATE TABLE IF NOT EXISTS public.attendance_alerts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  alert_type   text NOT NULL,
  period_key   text NOT NULL,
  threshold    integer NOT NULL,
  actual_value integer NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_alerts_type_check CHECK (
    alert_type IN ('late_soft_month','late_soft_rolling3','late_hard_month')
  ),
  CONSTRAINT attendance_alerts_unique UNIQUE (employee_id, alert_type, period_key)
);

CREATE INDEX IF NOT EXISTS idx_attendance_alerts_emp
  ON public.attendance_alerts (employee_id, created_at DESC);

-- ── 7. Закрытие дыры записи ───────────────────────────────────────────────────
-- Аудит: сотрудник мог вставлять и править собственные строки на любые даты, минуя
-- приложение. Снимаем все политики записи и отзываем гранты; запись — только через
-- SECURITY DEFINER функции 078, которые проверяют права внутри.

DROP POLICY IF EXISTS attendance_insert_self      ON public.attendance;
DROP POLICY IF EXISTS attendance_update_self      ON public.attendance;
DROP POLICY IF EXISTS attendance_insert_owner_rop ON public.attendance;
DROP POLICY IF EXISTS attendance_update_owner_rop ON public.attendance;
DROP POLICY IF EXISTS attendance_delete_owner     ON public.attendance;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.attendance FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.attendance FROM anon;

-- Чтение остаётся по области видимости (политика attendance_select_by_perm из 059).

-- Новые таблицы: RLS включён, чтение только у тех, кто управляет посещаемостью.
-- Счётчики и сигналы сотруднику не видны — это прямое требование владельца.
ALTER TABLE public.attendance_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_alerts      ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.attendance_corrections FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.attendance_alerts      FROM authenticated, anon;

-- Видят те, у кого есть право ПРАВИТЬ посещаемость и область шире собственной.
-- Получатель не зашит как owner: когда появится руководитель отдела с этим правом,
-- он начнёт видеть сигналы автоматически (требование владельца).
DROP POLICY IF EXISTS attendance_corrections_select ON public.attendance_corrections;
CREATE POLICY attendance_corrections_select ON public.attendance_corrections
  FOR SELECT TO authenticated
  USING ((SELECT public._my_perm_scope('attendance')) IN ('team','all'));

DROP POLICY IF EXISTS attendance_alerts_select ON public.attendance_alerts;
CREATE POLICY attendance_alerts_select ON public.attendance_alerts
  FOR SELECT TO authenticated
  USING (
    (SELECT public._my_perm_scope('attendance')) = 'all'
    OR ((SELECT public._my_perm_scope('attendance')) = 'team'
        AND employee_id IN (SELECT public._my_dept_employee_ids()))
  );

-- Триггера updated_at здесь намеренно нет: журнал правок append-only, строки
-- не редактируются (и грант UPDATE на него отозван выше).

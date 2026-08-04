-- Первый этап автоматической посещаемости; IF NOT EXISTS нужен из-за объединения веток.
ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS check_in_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_late BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS late_minutes INTEGER NOT NULL DEFAULT 0 CHECK (late_minutes >= 0),
  ADD COLUMN IF NOT EXISTS covering_for_employee_id UUID REFERENCES public.employees(id);

CREATE INDEX IF NOT EXISTS idx_attendance_covering
  ON public.attendance(covering_for_employee_id)
  WHERE covering_for_employee_id IS NOT NULL;

DROP POLICY IF EXISTS attendance_insert_self ON public.attendance;
DROP POLICY IF EXISTS attendance_update_self ON public.attendance;
CREATE POLICY attendance_insert_self ON public.attendance
  FOR INSERT TO authenticated WITH CHECK (employee_id = get_my_employee_id());
CREATE POLICY attendance_update_self ON public.attendance
  FOR UPDATE TO authenticated USING (employee_id = get_my_employee_id());


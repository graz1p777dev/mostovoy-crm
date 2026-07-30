-- Migration 022: Add alb_status and consulting_doctor to consultations
-- alb_status — статус ALB (отдельная воронка после записи)
-- consulting_doctor — кто проводил консультацию (текстовое поле)

ALTER TABLE public.consultations
  ADD COLUMN IF NOT EXISTS alb_status TEXT,
  ADD COLUMN IF NOT EXISTS consulting_doctor TEXT;

-- Мягкое ограничение (nullable — для обратной совместимости).
-- ADD CONSTRAINT не поддерживает IF NOT EXISTS — проверяем через pg_constraint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'consultations_alb_status_check'
  ) THEN
    ALTER TABLE public.consultations
      ADD CONSTRAINT consultations_alb_status_check
      CHECK (alb_status IS NULL OR alb_status IN ('Не записан', 'Записан', 'Пришёл', 'Не пришёл', 'Купил'));
  END IF;
END $$;

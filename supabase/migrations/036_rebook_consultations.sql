-- ── Перезапись консультаций: связь старой↔новой записи + статус «Перезаписанный» ──
--
-- Контекст: rebookConsultation уже помечает старую запись status='Перезапись' и создаёт
-- новую на новом дне. Не хватало (а) связующего поля между записями и (б) статуса для
-- новой записи. Эта миграция добавляет ТОЛЬКО схему — данные не трогаются, код
-- rebookConsultation правится отдельным шагом.
--
-- Утверждённая логика:
--   Старая запись (день переноса): status='Перезапись', rescheduled_to_id → новая запись.
--   Новая запись (новый день):     status='Перезаписанный', rescheduled_from_id → старая.
--
-- Начальный status изолирован от KPI/декомпозиции/финансов/зарплаты (blast-radius нулевой —
-- расчёты смотрят на status_after_fv/actual_status/amount/is_nv, не на status).
-- alb_status НЕ трогаем (исторический дрейф D1 — CHECK на alb в prod отсутствует).
-- Идемпотентно: IF [NOT] EXISTS + DROP/ADD CONSTRAINT.

-- 1. Связующие поля (self-reference, оба nullable, ON DELETE SET NULL —
--    удаление одной записи не каскадит, только обнуляет ссылку у связанной).
ALTER TABLE public.consultations
  ADD COLUMN IF NOT EXISTS rescheduled_to_id uuid
    REFERENCES public.consultations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rescheduled_from_id uuid
    REFERENCES public.consultations(id) ON DELETE SET NULL;

-- 2. Индексы на FK (обход связанных записей: «куда перенёс» / «откуда пришёл»).
CREATE INDEX IF NOT EXISTS idx_consultations_rescheduled_to
  ON public.consultations(rescheduled_to_id);
CREATE INDEX IF NOT EXISTS idx_consultations_rescheduled_from
  ON public.consultations(rescheduled_from_id);

-- 3. Расширить CHECK status: добавить 'Перезаписанный' ко ВСЕМ существующим значениям.
--    Пересоздаём (DROP + ADD) с полным списком — ничего из старого не теряем.
ALTER TABLE public.consultations
  DROP CONSTRAINT IF EXISTS consultations_status_check;

ALTER TABLE public.consultations
  ADD CONSTRAINT consultations_status_check
  CHECK (
    status IS NULL OR status = ANY (ARRAY[
      'Придёт'::text,
      'Не придёт'::text,
      'Перезапись'::text,
      'Отменил'::text,
      'Не отвечает'::text,
      'Перезаписанный'::text
    ])
  );

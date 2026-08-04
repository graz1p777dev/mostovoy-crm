-- ── Атомарная перезапись консультации: транзакционная RPC + целостность связи ──
--
-- Закрывает блокеры Codex:
--   P1 атомарность — весь перенос ОДНОЙ транзакцией (или всё, или ничего).
--   P1 повтор/гонки — FOR UPDATE + проверка rescheduled_to_id IS NULL внутри транзакции.
--   P2 целостность — CHECK против self-reference + partial unique на источник/цель связи.
--
-- Схема 036 (rescheduled_to_id/from_id, статус 'Перезаписанный') уже применена.
-- Функция SECURITY DEFINER с закреплённым search_path — как остальные SECDEF-функции (P0-02).
-- Авторизация вызывающего проверяется в Server Action (getUser + роль) ПЕРЕД вызовом;
-- RPC исполняется только под service_role (admin-клиент), anon/authenticated EXECUTE нет.
-- Идемпотентно: DROP CONSTRAINT IF EXISTS + ADD, CREATE INDEX/OR REPLACE IF NOT EXISTS.

-- ── P2: целостность связи на уровне БД ────────────────────────────────────────

-- Запись не может ссылаться сама на себя (IS DISTINCT FROM пропускает NULL).
ALTER TABLE public.consultations
  DROP CONSTRAINT IF EXISTS consultations_no_self_reschedule;
ALTER TABLE public.consultations
  ADD CONSTRAINT consultations_no_self_reschedule
  CHECK (
    rescheduled_to_id   IS DISTINCT FROM id
    AND rescheduled_from_id IS DISTINCT FROM id
  );

-- Один источник (старая запись) может быть перенесён максимум в одну новую.
CREATE UNIQUE INDEX IF NOT EXISTS uq_consultations_rescheduled_from
  ON public.consultations(rescheduled_from_id)
  WHERE rescheduled_from_id IS NOT NULL;

-- Одна новая запись может быть целью максимум одной старой.
CREATE UNIQUE INDEX IF NOT EXISTS uq_consultations_rescheduled_to
  ON public.consultations(rescheduled_to_id)
  WHERE rescheduled_to_id IS NOT NULL;

-- ── Транзакционная RPC перезаписи ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rebook_consultation(
  p_old_id   uuid,
  p_new_date date,
  p_new_time time,
  p_data     jsonb
)
RETURNS TABLE(old_id uuid, new_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_old    public.consultations%ROWTYPE;
  v_new_id uuid;
BEGIN
  -- Лочим старую запись — защита от параллельного/повторного переноса.
  SELECT * INTO v_old
    FROM public.consultations
   WHERE id = p_old_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'consultation_not_found';
  END IF;
  IF v_old.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'consultation_deleted';
  END IF;
  -- Уже перенесена — второй перенос запрещён (защита от дублей).
  IF v_old.rescheduled_to_id IS NOT NULL THEN
    RAISE EXCEPTION 'already_rescheduled';
  END IF;

  -- 1) Новая запись на новом дне: статус 'Перезаписанный', ссылка ОТКУДА.
  INSERT INTO public.consultations (
    date, time, client_name, phone, deal_number, format, manager_id,
    status, alb_status, actual_status, status_after_fv,
    amount, delivery_cost, is_nv, comment, consulting_doctor,
    rescheduled_from_id
  ) VALUES (
    p_new_date, p_new_time,
    p_data->>'client_name',
    p_data->>'phone',
    p_data->>'deal_number',
    p_data->>'format',
    NULLIF(p_data->>'manager_id','')::uuid,
    'Перезаписанный', NULL, NULL, NULL,
    0, 0, true, NULL, NULL,
    p_old_id
  ) RETURNING id INTO v_new_id;

  -- 2) Старая запись: статус 'Перезапись' + ссылка КУДА. Дату/время не трогаем.
  UPDATE public.consultations SET
    status            = 'Перезапись',
    client_name       = p_data->>'client_name',
    phone             = p_data->>'phone',
    deal_number       = p_data->>'deal_number',
    format            = p_data->>'format',
    manager_id        = NULLIF(p_data->>'manager_id','')::uuid,
    alb_status        = p_data->>'alb_status',
    actual_status     = p_data->>'actual_status',
    status_after_fv   = p_data->>'status_after_fv',
    amount            = COALESCE((p_data->>'amount')::numeric, 0),
    delivery_cost     = COALESCE((p_data->>'delivery_cost')::numeric, 0),
    is_nv             = COALESCE((p_data->>'is_nv')::boolean, true),
    comment           = p_data->>'comment',
    consulting_doctor = p_data->>'consulting_doctor',
    rescheduled_to_id = v_new_id,
    updated_at        = now()
  WHERE id = p_old_id;

  RETURN QUERY SELECT p_old_id, v_new_id;
END;
$$;

-- Права: только service_role (Server Action через admin-клиент). anon/authenticated — нет.
REVOKE ALL ON FUNCTION public.rebook_consultation(uuid, date, time, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rebook_consultation(uuid, date, time, jsonb) TO service_role;

-- ============================================================
-- Migration 001: Core Functions
-- Базовые функции, необходимые для работы триггеров и RLS.
-- Должна выполняться первой.
-- ============================================================

-- ------------------------------------------------------------
-- Функция: set_updated_at()
-- Автоматически обновляет поле updated_at при UPDATE.
-- Применяется ко всем таблицам с полем updated_at.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------
-- Функция: get_my_employee_id()
-- Возвращает id записи сотрудника для текущего auth.uid().
-- Используется в RLS политиках.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_employee_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT id
  FROM public.employees
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

-- ------------------------------------------------------------
-- Функция: get_my_role()
-- Возвращает роль текущего сотрудника (owner/rop/mp/lmai/accountant).
-- Используется в RLS политиках.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT role
  FROM public.employees
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

-- ------------------------------------------------------------
-- Функция: get_my_department_id()
-- Возвращает department_id текущего сотрудника.
-- Используется в RLS политиках для РОП (команда).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_department_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT department_id
  FROM public.employees
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

-- Права на вызов функций
GRANT EXECUTE ON FUNCTION public.get_my_employee_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_department_id() TO authenticated;

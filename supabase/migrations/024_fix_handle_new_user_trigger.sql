-- Migration 024: fix handle_new_user trigger
--
-- Проблема: триггер on_auth_user_created вызывал handle_new_user(),
-- которая пыталась вставить запись в public.profiles — таблица не существует.
-- Это приводило к "Database error creating new user" (HTTP 500) при каждом
-- вызове admin.auth.admin.createUser().
--
-- Решение: делаем функцию no-op. Запись в employees создаётся явно
-- через Server Action createEmployee() после успешного создания auth.users.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Запись сотрудника создаётся через Server Action createEmployee,
  -- а не автоматически при регистрации.
  RETURN NEW;
END;
$$;

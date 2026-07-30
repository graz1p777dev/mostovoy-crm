-- Добавляем поле принудительной смены пароля при первом входе.
-- default true — новые сотрудники должны сменить временный пароль.
-- Для уже существующих owner-записей ставим false.

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT true;

-- Владелец уже имеет нормальный пароль — не трогаем его при входе
UPDATE employees
  SET must_change_password = false
  WHERE role = 'owner';

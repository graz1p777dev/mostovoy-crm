-- ============================================================
-- Migration 002: roles + permissions
-- Справочник ролей и матрица прав доступа.
-- ============================================================

-- ------------------------------------------------------------
-- Таблица: roles
-- ------------------------------------------------------------
CREATE TABLE public.roles (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(50) NOT NULL,
  label       VARCHAR(100) NOT NULL,
  description TEXT,
  is_system   BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT roles_name_unique UNIQUE (name),
  CONSTRAINT roles_name_check CHECK (
    name IN ('owner','rop','mp','lmai','accountant','custom')
  )
);

-- Индексы
CREATE INDEX idx_roles_name ON public.roles(name);

-- Триггер updated_at
CREATE TRIGGER set_roles_updated_at
  BEFORE UPDATE ON public.roles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "roles_select_authenticated"
  ON public.roles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "roles_insert_owner"
  ON public.roles FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_role() = 'owner');

CREATE POLICY "roles_update_owner"
  ON public.roles FOR UPDATE
  TO authenticated
  USING (public.get_my_role() = 'owner');

CREATE POLICY "roles_delete_owner"
  ON public.roles FOR DELETE
  TO authenticated
  USING (public.get_my_role() = 'owner');

-- Seed данные (системные роли)
INSERT INTO public.roles (name, label, description, is_system) VALUES
  ('owner',     'Владелец',                    'Полный доступ ко всем данным системы', true),
  ('rop',       'Руководитель отдела продаж',  'Управление командой МП, просмотр аналитики', true),
  ('mp',        'Менеджер по продажам',        'Ведение записей и своей декомпозиции', true),
  ('lmai',      'Менеджер по лидогенерации',   'Ведение своих показателей LMAI', true),
  ('accountant','Бухгалтер',                   'Доступ к финансам и зарплатам', true);

-- ------------------------------------------------------------
-- Таблица: permissions
-- ------------------------------------------------------------
CREATE TABLE public.permissions (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id    UUID         NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  resource   VARCHAR(100) NOT NULL,
  can_view   BOOLEAN      NOT NULL DEFAULT false,
  can_create BOOLEAN      NOT NULL DEFAULT false,
  can_edit   BOOLEAN      NOT NULL DEFAULT false,
  can_delete BOOLEAN      NOT NULL DEFAULT false,
  scope      TEXT         NOT NULL DEFAULT 'own',
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT permissions_role_resource_unique UNIQUE (role_id, resource),
  CONSTRAINT permissions_scope_check CHECK (scope IN ('own','team','all'))
);

-- Индексы
CREATE INDEX idx_permissions_role_id  ON public.permissions(role_id);
CREATE INDEX idx_permissions_resource ON public.permissions(resource);

-- Триггер updated_at
CREATE TRIGGER set_permissions_updated_at
  BEFORE UPDATE ON public.permissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "permissions_select_authenticated"
  ON public.permissions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "permissions_insert_owner"
  ON public.permissions FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_role() = 'owner');

CREATE POLICY "permissions_update_owner"
  ON public.permissions FOR UPDATE
  TO authenticated
  USING (public.get_my_role() = 'owner');

CREATE POLICY "permissions_delete_owner"
  ON public.permissions FOR DELETE
  TO authenticated
  USING (public.get_my_role() = 'owner');

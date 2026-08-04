-- ─── 044: системной остаётся ТОЛЬКО роль owner ────────────────────────────────
--
-- До этой миграции системными (is_system=true) были owner, rop, mp, lmai, accountant —
-- их нельзя было переименовать, изменить уровень доступа или удалить. Бизнес-требование:
-- владелец должен свободно управлять структурой ролей компании (переименовать «РОП» в
-- «Руководитель направления», удалить неиспользуемую роль, завести свои).
--
-- Единственная неприкосновенная роль — owner: на ней держится вся система прав
-- (can() в src/lib/authz.ts даёт owner безусловный доступ), и без неё систему
-- невозможно администрировать.
--
-- UI (RolesPanel.tsx) и серверные экшены (settings.ts) уже гардят по is_system —
-- поэтому смена флага автоматически включает переименование/удаление для остальных.
-- Существующие гарды в deleteRole(): owner-only вызов + запрет удаления роли,
-- к которой привязаны активные сотрудники. Здесь добавляем защиту на уровне БД,
-- чтобы owner нельзя было снести в обход приложения (прямой SQL, service_role).

-- ─── 1. Снять системный флаг со всех ролей кроме owner ────────────────────────

UPDATE public.roles
SET    is_system = false,
       updated_at = now()
WHERE  name <> 'owner'
  AND  is_system = true;

-- Гарантия обратного: owner всегда системная (на случай, если флаг сбили руками).
UPDATE public.roles
SET    is_system = true,
       updated_at = now()
WHERE  name = 'owner'
  AND  is_system = false;

-- ─── 2. Защита owner на уровне БД (неотключаемая из приложения) ───────────────
-- Три инварианта:
--   а) роль owner нельзя удалить (в т.ч. мягко — через deleted_at);
--   б) роль owner нельзя переименовать (name — идентификатор в employees.role);
--   в) с роли owner нельзя снять is_system.

CREATE OR REPLACE FUNCTION public.protect_owner_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.name = 'owner' THEN
      RAISE EXCEPTION 'owner_role_protected: роль «Владелец» удалить нельзя';
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE
  IF OLD.name = 'owner' THEN
    IF NEW.name <> OLD.name THEN
      RAISE EXCEPTION 'owner_role_protected: системное имя роли «Владелец» изменить нельзя';
    END IF;
    IF NEW.is_system = false THEN
      RAISE EXCEPTION 'owner_role_protected: роль «Владелец» должна оставаться системной';
    END IF;
    IF NEW.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'owner_role_protected: роль «Владелец» нельзя архивировать';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_owner_role_del ON public.roles;
CREATE TRIGGER trg_protect_owner_role_del
  BEFORE DELETE ON public.roles
  FOR EACH ROW EXECUTE FUNCTION public.protect_owner_role();

DROP TRIGGER IF EXISTS trg_protect_owner_role_upd ON public.roles;
CREATE TRIGGER trg_protect_owner_role_upd
  BEFORE UPDATE ON public.roles
  FOR EACH ROW EXECUTE FUNCTION public.protect_owner_role();

COMMENT ON FUNCTION public.protect_owner_role() IS
  'Инвариант системы прав: роль owner нельзя удалить, переименовать или лишить is_system (миграция 044).';

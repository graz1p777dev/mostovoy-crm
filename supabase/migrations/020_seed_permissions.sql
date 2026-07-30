-- ============================================================
-- Migration 020: Seed Permissions Matrix
-- Заполнение матрицы прав доступа по ролям.
-- Выполняется последней (после создания roles).
-- ============================================================

-- Вспомогательная функция для вставки прав
-- INSERT OR IGNORE через ON CONFLICT DO NOTHING
DO $$
DECLARE
  v_owner_id     UUID;
  v_rop_id       UUID;
  v_mp_id        UUID;
  v_lmai_id      UUID;
  v_accountant_id UUID;
BEGIN
  SELECT id INTO v_owner_id      FROM public.roles WHERE name = 'owner';
  SELECT id INTO v_rop_id        FROM public.roles WHERE name = 'rop';
  SELECT id INTO v_mp_id         FROM public.roles WHERE name = 'mp';
  SELECT id INTO v_lmai_id       FROM public.roles WHERE name = 'lmai';
  SELECT id INTO v_accountant_id FROM public.roles WHERE name = 'accountant';

  -- -------------------------------------------------------
  -- OWNER: полный доступ ко всему
  -- -------------------------------------------------------
  INSERT INTO public.permissions (role_id, resource, can_view, can_create, can_edit, can_delete, scope)
  VALUES
    (v_owner_id, 'dashboard',    true, true, true, true, 'all'),
    (v_owner_id, 'consultations',true, true, true, true, 'all'),
    (v_owner_id, 'decomposition',true, true, true, true, 'all'),
    (v_owner_id, 'employees',    true, true, true, true, 'all'),
    (v_owner_id, 'finances',     true, true, true, true, 'all'),
    (v_owner_id, 'salaries',     true, true, true, true, 'all'),
    (v_owner_id, 'calendar',     true, true, true, true, 'all'),
    (v_owner_id, 'documents',    true, true, true, true, 'all'),
    (v_owner_id, 'notifications',true, true, true, true, 'all'),
    (v_owner_id, 'settings',     true, true, true, true, 'all'),
    (v_owner_id, 'integrations', true, true, true, true, 'all'),
    (v_owner_id, 'investors',    true, true, true, true, 'all'),
    (v_owner_id, 'kpi_settings', true, true, true, true, 'all')
  ON CONFLICT (role_id, resource) DO NOTHING;

  -- -------------------------------------------------------
  -- РОП: команда, нет финансов и инвесторов
  -- -------------------------------------------------------
  INSERT INTO public.permissions (role_id, resource, can_view, can_create, can_edit, can_delete, scope)
  VALUES
    (v_rop_id, 'dashboard',    true, false, false, false, 'team'),
    (v_rop_id, 'consultations',true, true,  true,  true,  'team'),
    (v_rop_id, 'decomposition',true, true,  true,  false, 'team'),
    (v_rop_id, 'employees',    true, false, false, false, 'team'),
    (v_rop_id, 'finances',     false,false, false, false, 'team'),
    (v_rop_id, 'salaries',     true, false, false, false, 'team'),
    (v_rop_id, 'calendar',     true, true,  true,  false, 'team'),
    (v_rop_id, 'documents',    true, false, false, false, 'team'),
    (v_rop_id, 'notifications',true, false, true,  false, 'own'),
    (v_rop_id, 'settings',     true, false, false, false, 'all'),
    (v_rop_id, 'integrations', false,false, false, false, 'all'),
    (v_rop_id, 'investors',    false,false, false, false, 'all'),
    (v_rop_id, 'kpi_settings', true, false, false, false, 'all')
  ON CONFLICT (role_id, resource) DO NOTHING;

  -- -------------------------------------------------------
  -- МП: только своё
  -- -------------------------------------------------------
  INSERT INTO public.permissions (role_id, resource, can_view, can_create, can_edit, can_delete, scope)
  VALUES
    (v_mp_id, 'dashboard',    true, false, false, false, 'own'),
    (v_mp_id, 'consultations',true, true,  true,  false, 'own'),
    (v_mp_id, 'decomposition',true, false, false, false, 'own'),
    (v_mp_id, 'employees',    true, false, false, false, 'own'),
    (v_mp_id, 'finances',     false,false, false, false, 'own'),
    (v_mp_id, 'salaries',     true, false, false, false, 'own'),
    (v_mp_id, 'calendar',     true, false, false, false, 'own'),
    (v_mp_id, 'documents',    true, false, false, false, 'own'),
    (v_mp_id, 'notifications',true, false, true,  false, 'own'),
    (v_mp_id, 'settings',     true, false, false, false, 'all'),
    (v_mp_id, 'integrations', false,false, false, false, 'all'),
    (v_mp_id, 'investors',    false,false, false, false, 'all'),
    (v_mp_id, 'kpi_settings', true, false, false, false, 'all')
  ON CONFLICT (role_id, resource) DO NOTHING;

  -- -------------------------------------------------------
  -- LMAI: только своё, нет консультаций в полном объёме
  -- -------------------------------------------------------
  INSERT INTO public.permissions (role_id, resource, can_view, can_create, can_edit, can_delete, scope)
  VALUES
    (v_lmai_id, 'dashboard',    true, false, false, false, 'own'),
    (v_lmai_id, 'consultations',true, true,  true,  false, 'own'),
    (v_lmai_id, 'decomposition',true, false, false, false, 'own'),
    (v_lmai_id, 'employees',    true, false, false, false, 'own'),
    (v_lmai_id, 'finances',     false,false, false, false, 'own'),
    (v_lmai_id, 'salaries',     true, false, false, false, 'own'),
    (v_lmai_id, 'calendar',     true, false, false, false, 'own'),
    (v_lmai_id, 'documents',    false,false, false, false, 'own'),
    (v_lmai_id, 'notifications',true, false, true,  false, 'own'),
    (v_lmai_id, 'settings',     true, false, false, false, 'all'),
    (v_lmai_id, 'integrations', false,false, false, false, 'all'),
    (v_lmai_id, 'investors',    false,false, false, false, 'all'),
    (v_lmai_id, 'kpi_settings', true, false, false, false, 'all')
  ON CONFLICT (role_id, resource) DO NOTHING;

  -- -------------------------------------------------------
  -- Бухгалтер: финансы и зарплаты
  -- -------------------------------------------------------
  INSERT INTO public.permissions (role_id, resource, can_view, can_create, can_edit, can_delete, scope)
  VALUES
    (v_accountant_id, 'dashboard',    false,false, false, false, 'all'),
    (v_accountant_id, 'consultations',false,false, false, false, 'all'),
    (v_accountant_id, 'decomposition',false,false, false, false, 'all'),
    (v_accountant_id, 'employees',    true, false, false, false, 'all'),
    (v_accountant_id, 'finances',     true, true,  true,  false, 'all'),
    (v_accountant_id, 'salaries',     true, true,  true,  false, 'all'),
    (v_accountant_id, 'calendar',     false,false, false, false, 'all'),
    (v_accountant_id, 'documents',    true, true,  true,  false, 'all'),
    (v_accountant_id, 'notifications',true, false, true,  false, 'own'),
    (v_accountant_id, 'settings',     true, false, false, false, 'all'),
    (v_accountant_id, 'integrations', false,false, false, false, 'all'),
    (v_accountant_id, 'investors',    false,false, false, false, 'all'),
    (v_accountant_id, 'kpi_settings', true, false, false, false, 'all')
  ON CONFLICT (role_id, resource) DO NOTHING;

END;
$$;

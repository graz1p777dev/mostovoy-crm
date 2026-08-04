-- ── Дополнение таблицы permissions перед включением реальной проверки прав ──
--
-- permissions существует с 020_seed_permissions, но код её не читает («мёртвая» таблица).
-- Перед тем как authz-слой начнёт реально проверять права (fail-closed), нужно закрыть
-- два пробела, иначе включение проверки СЛОМАЕТ существующее поведение для всех:
--   1. Роль 'targetolog' не имела НИ ОДНОЙ строки в permissions (0 из 65) — под fail-closed
--      она была бы заблокирована везде, включая «Задачи», куда её пускает nav.ts.
--   2. Ресурсы 'marketing', 'attendance', 'tasks' вообще не существовали как resource —
--      ни у одной роли, включая owner. Под fail-closed это заблокировало бы владельца.
--
-- Значения ниже подобраны по ФАКТИЧЕСКОМУ текущему поведению кода (nav.ts + проверки
-- isManager/permission_level в tasks.ts, attendance.ts, marketing-decomposition.ts), чтобы
-- включение authz не меняло поведение приложения, только начинало его реально проверять.
-- Дальнейшая тонкая настройка — через новую панель «Роли и доступы» в Настройках.

-- 1. targetolog: строки на все существующие 13 ресурсов (employee-уровень, свои данные).
INSERT INTO public.permissions (role_id, resource, can_view, can_create, can_edit, can_delete, scope)
SELECT r.id, res.resource, false, false, false, false, 'own'
FROM public.roles r
CROSS JOIN (VALUES
  ('calendar'),('consultations'),('dashboard'),('decomposition'),('documents'),
  ('employees'),('finances'),('integrations'),('investors'),('kpi_settings'),
  ('notifications'),('salaries'),('settings')
) AS res(resource)
WHERE r.name = 'targetolog'
ON CONFLICT (role_id, resource) DO NOTHING;

-- Точечно включаем то, что targetolog фактически имеет сегодня: KPI-настройки на чтение,
-- дашборд/уведомления на чтение своих, задачи (см. ниже) — уже есть в nav.ts.
UPDATE public.permissions p SET can_view = true
FROM public.roles r
WHERE p.role_id = r.id AND r.name = 'targetolog'
  AND p.resource IN ('kpi_settings', 'dashboard', 'notifications', 'settings');
UPDATE public.permissions p SET can_edit = true
FROM public.roles r
WHERE p.role_id = r.id AND r.name = 'targetolog' AND p.resource = 'notifications';

-- 2. Новые ресурсы: marketing, attendance, tasks — для ВСЕХ ролей.
INSERT INTO public.permissions (role_id, resource, can_view, can_create, can_edit, can_delete, scope)
SELECT r.id, res.resource, false, false, false, false,
  CASE WHEN r.name = 'owner' THEN 'all' WHEN r.name = 'rop' THEN 'team' ELSE 'own' END
FROM public.roles r
CROSS JOIN (VALUES ('marketing'), ('attendance'), ('tasks')) AS res(resource)
ON CONFLICT (role_id, resource) DO NOTHING;

-- marketing: owner/rop управляют (view all/team); targetolog вводит свои данные (view+create+edit own).
UPDATE public.permissions p SET can_view = true, can_create = true, can_edit = true
FROM public.roles r WHERE p.role_id = r.id AND r.name IN ('owner','rop') AND p.resource = 'marketing';
UPDATE public.permissions p SET can_view = true, can_create = true, can_edit = true
FROM public.roles r WHERE p.role_id = r.id AND r.name = 'targetolog' AND p.resource = 'marketing';

-- attendance: owner/rop — экран управления (view+edit team/all); accountant — только просмотр;
-- mp/lmai/targetolog — свой чек-ин (view+create own, без edit чужого).
UPDATE public.permissions p SET can_view = true, can_create = true, can_edit = true
FROM public.roles r WHERE p.role_id = r.id AND r.name IN ('owner','rop') AND p.resource = 'attendance';
UPDATE public.permissions p SET can_view = true
FROM public.roles r WHERE p.role_id = r.id AND r.name = 'accountant' AND p.resource = 'attendance';
UPDATE public.permissions p SET can_view = true, can_create = true
FROM public.roles r WHERE p.role_id = r.id AND r.name IN ('mp','lmai','targetolog') AND p.resource = 'attendance';

-- tasks: owner/rop назначают (view team/all + create+edit); mp/lmai/targetolog видят и
-- закрывают только свои назначенные (view+edit own, без create — назначает менеджер).
UPDATE public.permissions p SET can_view = true, can_create = true, can_edit = true
FROM public.roles r WHERE p.role_id = r.id AND r.name IN ('owner','rop') AND p.resource = 'tasks';
UPDATE public.permissions p SET can_view = true, can_edit = true
FROM public.roles r WHERE p.role_id = r.id AND r.name IN ('mp','lmai','targetolog') AND p.resource = 'tasks';
UPDATE public.permissions p SET can_view = false
FROM public.roles r WHERE p.role_id = r.id AND r.name = 'accountant' AND p.resource IN ('marketing','tasks');

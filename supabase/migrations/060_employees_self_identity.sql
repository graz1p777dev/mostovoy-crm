-- ─── 060: identity-строка сотрудника читается ВСЕГДА (Блокер выката P1) ────────
--
-- 059 сделала единственной SELECT-политикой employees `employees_select_by_perm`, которая
-- требует employees.can_view (через _my_perm_scope('employees')) даже для СОБСТВЕННОЙ строки.
-- Роль с employees.can_view=false (на проде — активный targetolog) теряет доступ к своей же
-- строке. А она читается пользовательским (RLS) клиентом в критичных identity-путях:
--   • login / SSR-identity (dashboard/layout.tsx), getViewer (lib/decomposition/viewer.ts).
-- Итог: initialEmployee=null → выброс на /login, неработающие Server Actions.
--
-- Фикс: отдельная МИНИМАЛЬНАЯ self-политика — только СВОЯ строка по user_id, БЕЗ проверки
-- employees.can_view. Политики permissive объединяются через OR, поэтому:
--   • свою identity-строку видит каждый активный сотрудник (нужно для входа);
--   • доступ к ЧУЖИМ строкам остаётся строго permissions-driven (employees_select_by_perm).
-- Это не ослабляет модель: видеть СВОЮ строку — не утечка; чужие по-прежнему по правам.
--
-- (auth.uid() обёрнут в (SELECT ...) — init-plan, как в 059.)

CREATE POLICY employees_select_self_identity ON public.employees FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) AND deleted_at IS NULL);

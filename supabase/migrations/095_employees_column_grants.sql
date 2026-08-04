-- Эскалация до owner прямым запросом в PostgREST: закрываем правами на колонки.
--
-- Что было открыто. 093_role_grants.sql выдаёт authenticated право UPDATE на все
-- таблицы public, и employees в число исключений не попал. При этом все три
-- UPDATE-политики на employees заданы только через USING, без WITH CHECK:
--   employees_update_owner          USING get_my_role() = 'owner'
--   employees_update_self_limited   USING get_my_role() IN ('mp','lmai') AND user_id = auth.uid()
--   employees_update_employee_perm  USING get_my_permission_level() = 'employee' AND user_id = auth.uid()
-- Когда WITH CHECK не задан, Postgres проверяет выражением USING и НОВУЮ строку.
-- А get_my_role() / get_my_permission_level() объявлены STABLE, то есть читают
-- снимок данных до текущего оператора и внутри самого UPDATE всё ещё возвращают
-- прежнюю роль. Поэтому проверка проходит на строке, где role уже 'owner'.
--
-- Барьеров дальше нет: CHECK employees_role_check снят в 025, внешний ключ
-- employees.role → roles.name значение 'owner' принимает, триггеров на колонке
-- role не существует. Сервер затем читает строку админ-клиентом мимо RLS
-- (src/lib/identity.ts), can() в src/lib/authz.ts коротит на role === 'owner' —
-- и сотрудник получает полные права владельца.
--
-- INSERT и DELETE трогать не нужно: employees_insert_owner имеет WITH CHECK
-- get_my_role() = 'owner', employees_delete_owner — такой же USING. Дыра ровно
-- в UPDATE.
--
-- Почему права на колонки, а не WITH CHECK. Права на колонку проверяются ДО RLS
-- и не зависят от снимка данных, поэтому обход через STABLE-функцию закрывается
-- целиком. WITH CHECK на этих политиках опирался бы на те же функции и остался бы
-- обходимым.
--
-- ВАЖНО про порядок команд. Табличный GRANT UPDATE подразумевает все колонки, и
-- колоночный REVOKE из него ничего не вычитает — эффективное право есть, если
-- выдано ЛИБО на таблицу, ЛИБО на колонку. Поэтому сначала снимаем табличное
-- право целиком и только потом выдаём поимённо безопасные колонки. Обратный
-- порядок (только колоночный REVOKE) не даёт никакого эффекта.

-- 1. Снять табличное право: оно перекрывает любые ограничения по колонкам.
REVOKE UPDATE ON public.employees FROM anon, authenticated;

-- 2. Вернуть ровно те колонки, которые сотрудник правит в своём профиле.
--    Список намеренно короткий: role, user_id, department_id, status, deleted_at,
--    dismissed_at, base_salary, kpi_coefficient, must_change_password и поля
--    учёта рабочего времени сюда не входят. Их меняет только серверный код под
--    service_role, где право проверяет can() из src/lib/authz.ts.
--    Колонку updated_at выдавать не нужно: её проставляет триггер
--    set_employees_updated_at, а триггер выполняется с правами владельца таблицы.
GRANT UPDATE (name, phone, email, avatar_url, birth_date) ON public.employees TO authenticated;

-- 3. anon не должен писать в кадровую таблицу вообще: политик, отдающих ему
--    строки, нет, но табличные гранты из 093 у него есть — не полагаемся на это.
REVOKE INSERT, DELETE ON public.employees FROM anon;

COMMENT ON TABLE public.employees IS
  'Кадровая таблица. UPDATE у anon/authenticated отозван на уровне таблицы миграцией 095; authenticated оставлены только колонки name, phone, email, avatar_url, birth_date. Роль, привязку к аккаунту, статус и денежные поля меняет исключительно серверный код под service_role. При выдаче новых грантов вида «GRANT ... ON ALL TABLES IN SCHEMA public» повторить обе команды из 095, иначе табличное право вернётся и снова перекроет колоночные ограничения.';

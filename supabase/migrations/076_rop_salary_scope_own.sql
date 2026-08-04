-- ─── 076: право РОПа на зарплаты — own вместо team ────────────────────────────
--
-- ПОЧЕМУ. Право и поведение разошлись. Бизнес-правило, подтверждённое владельцем:
-- сотрудник видит ТОЛЬКО свою зарплату; все зарплаты видят owner и accountant.
-- Код это и делает — getSalarySheet отдаёт рядовым ролям одну собственную строку
-- (requireOwnSalaryAccess, src/actions/salary.ts). А в permissions у rop до сих пор
-- стоит salaries.scope='team', то есть право шире фактического поведения.
--
-- ОТКУДА ВЗЯЛСЯ 'team'. Из первичного сида: 020_seed_permissions.sql:53 —
--   (v_rop_id, 'salaries', true, false, false, false, 'team')
-- Это был блочный дефолт «РОП = команда» на все ресурсы разом, а не решение про
-- зарплаты. Ни одна миграция после 020 это значение не меняла (проверено по всем
-- UPDATE public.permissions в 021–075). Бэкфилл в 042_role_permissions_atomic.sql:56
-- ставит 'team' для permission_level='department_head', но идёт с
-- ON CONFLICT DO NOTHING — существующую строку rop он не трогает и повторно её
-- не вернёт; на новые роли этот дефолт по-прежнему распространяется.
--
-- ПОСЛЕДСТВИЕ ЗА ПРЕДЕЛАМИ UI. RLS-политики salaries в 058_rls_permissions_driven.sql
-- (строки 144–147 и далее) читают _my_perm_scope('salaries'): при 'team' РОП мог бы
-- читать строки зарплат своего отдела напрямую из таблицы, минуя серверный экшен.
-- После 076 и право, и RLS сходятся с поведением кода.
--
-- НА БУДУЩЕЕ (в этой миграции НЕ реализуется): планируется отдельный модуль
-- «Рейтинг отдела» — публичные результаты и заработок по своему отделу. Когда он
-- появится, РОПу вернут team-доступ осознанно и отдельной миграцией. Сейчас в
-- код и права это не закладывается.
--
-- Идемпотентность: UPDATE ограничен парой (rop, salaries) и условием scope <> 'own',
-- поэтому повторный прогон меняет 0 строк. Проверка в конце — fail-closed.

UPDATE public.permissions p
SET    scope = 'own', updated_at = now()
FROM   public.roles r
WHERE  p.role_id = r.id
  AND  r.name = 'rop'
  AND  r.deleted_at IS NULL
  AND  p.resource = 'salaries'
  AND  p.scope <> 'own';

-- ── Fail-closed проверка результата ──────────────────────────────────────────
-- Молча разойтись право и поведение больше не должны: если после UPDATE у rop
-- на salaries не 'own' (или строки прав вовсе нет при живой роли) — миграция падает.
DO $verify$
DECLARE v_scope text; v_role_exists boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.roles WHERE name = 'rop' AND deleted_at IS NULL)
    INTO v_role_exists;

  IF NOT v_role_exists THEN
    RAISE NOTICE '076: роль rop отсутствует — менять нечего, проверка пропущена';
    RETURN;
  END IF;

  SELECT p.scope INTO v_scope
  FROM public.permissions p
  JOIN public.roles r ON r.id = p.role_id
  WHERE r.name = 'rop' AND r.deleted_at IS NULL AND p.resource = 'salaries';

  IF v_scope IS NULL THEN
    RAISE EXCEPTION 'verify_076_missing_row: у роли rop нет строки прав на ресурс salaries — права засеяны частично, разберитесь до выката';
  END IF;

  IF v_scope <> 'own' THEN
    RAISE EXCEPTION 'verify_076_scope_not_own: у rop salaries.scope = % (ожидалось own)', v_scope;
  END IF;

  RAISE NOTICE '076: rop salaries.scope = own ✓';
END
$verify$;

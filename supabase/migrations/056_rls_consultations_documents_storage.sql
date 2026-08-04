-- ─── 056: остатки RLS-BOLA — consultations, documents, storage.objects + accountant/attendance ─
--
-- Свип 055 искал таблицы по колонке employee_id и потому ПРОПУСТИЛ владельческие колонки
-- другого имени: consultations.manager_id, documents.uploaded_by, storage.objects (файлы
-- документов). Здесь свип исчерпывающий — по всем чувствительным таблицам независимо от
-- имени колонки-владельца. Модель прежняя: owner → все; department_head/rop → свой отдел;
-- сотрудник → своё. Помним: permissive-политики объединяются через OR, поэтому широкую
-- надо УДАЛЯТЬ, а не дополнять.

-- ══ 1. consultations — широкая owner/rop → owner-only (rop идёт через team-политику) ══
-- rop.consultations.scope='team', а consultations_select_owner_rop (007) давала rop ВСЕ
-- неудалённые записи (имя, телефон, сумма). Узкая consultations_select_dept_head_perm уже
-- есть — оставляем её для rop; широкую сводим к owner.
DROP POLICY IF EXISTS consultations_select_owner_rop ON public.consultations;
CREATE POLICY consultations_select_owner ON public.consultations FOR SELECT TO authenticated
  USING (public.get_my_role() = 'owner' AND deleted_at IS NULL);
-- accountant.consultations.can_view=false и в политиках его нет — доступа не было и не будет.

-- ══ 2. documents (таблица) — owner/accountant → все; rop/department_head → свой отдел ══
-- accountant.documents.scope='all' (по праву) — сохраняем полный доступ. rop.documents.scope
-- ='team' — раньше широкая documents_select_owner_accountant_rop давала rop ВСЕ документы.
-- Отдел документа определяем через uploaded_by → employees.department_id.
DROP POLICY IF EXISTS documents_select_owner_accountant_rop ON public.documents;
CREATE POLICY documents_select_owner_accountant ON public.documents FOR SELECT TO authenticated
  USING (public.get_my_role() = ANY (ARRAY['owner','accountant']) AND deleted_at IS NULL);
CREATE POLICY documents_select_dept_head ON public.documents FOR SELECT TO authenticated
  USING (
    public.get_my_permission_level() = 'department_head'
    AND deleted_at IS NULL
    AND uploaded_by IN (
      SELECT e.id FROM public.employees e
      WHERE e.department_id = public.get_my_department_id() AND e.deleted_at IS NULL
    )
  );
-- documents_select_self (mp/lmai uploaded_by=self) уже корректна — не трогаем.

-- ══ 3. storage.objects (bucket 'documents') — то же + ИСПРАВЛЕНИЕ бага self-политики ══
-- Широкая documents_select_owner_accountant_rop (019) давала rop ВСЕ файлы документов.
-- Плюс documents_select_self (019) содержала баг: `d.storage_path = d.name` — сравнение
-- документа с самим собой, без привязки к текущему объекту → mp/lmai, загрузивший хоть
-- один файл, видел ВСЕ файлы бакета. Корректная привязка: d.storage_path = objects.name.
DROP POLICY IF EXISTS documents_select_owner_accountant_rop ON storage.objects;
DROP POLICY IF EXISTS documents_select_self ON storage.objects;

CREATE POLICY documents_objects_select_owner_accountant ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'documents'
    AND public.get_my_role() = ANY (ARRAY['owner','accountant'])
  );
CREATE POLICY documents_objects_select_dept_head ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'documents'
    AND public.get_my_permission_level() = 'department_head'
    AND EXISTS (
      SELECT 1 FROM public.documents d
      JOIN public.employees e ON e.id = d.uploaded_by
      WHERE d.storage_path = objects.name
        AND e.department_id = public.get_my_department_id()
        AND d.deleted_at IS NULL
    )
  );
CREATE POLICY documents_objects_select_self ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'documents'
    AND EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.storage_path = objects.name
        AND d.uploaded_by = public.get_my_employee_id()
        AND d.deleted_at IS NULL
    )
  );

-- ══ 4. attendance — устранить расхождение RLS↔RBAC для accountant (NOTE Codex #6) ══
-- accountant.attendance.scope='own' (право), но 055 оставила accountant в широкой политике
-- (весь охват). Приводим RLS к праву: accountant видит только СВОЮ посещаемость. Причина
-- выбора (RLS→право, а не право→all): расчёт зарплаты идёт server-side через service_role
-- (RLS не мешает), значит прямой доступ бухгалтера ко всей attendance по Data API не нужен,
-- а RBAC намеренно ограничил его 'own'. owner остаётся 'all'; rop — свой отдел (dept_head).
DROP POLICY IF EXISTS attendance_select_owner_accountant ON public.attendance;
CREATE POLICY attendance_select_owner ON public.attendance FOR SELECT TO authenticated
  USING (public.get_my_role() = 'owner');
CREATE POLICY attendance_select_accountant_own ON public.attendance FOR SELECT TO authenticated
  USING (public.get_my_role() = 'accountant' AND employee_id = public.get_my_employee_id());

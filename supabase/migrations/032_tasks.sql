-- ============================================================
-- Migration 032: tasks (канбан-таск-менеджер)
-- Общая доска задач для сотрудников.
--   visibility = 'all'        → видят все сотрудники
--   visibility = 'department' → видят сотрудники отдела задачи
--   visibility = 'private'    → видят автор, исполнитель и участники
-- Owner видит все задачи. Двигать/редактировать может любой, кто видит задачу.
-- Удалять/менять видимость и состав участников — автор или owner.
-- ============================================================

CREATE TABLE public.tasks (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  title         VARCHAR(300) NOT NULL,
  description   TEXT,
  status        TEXT         NOT NULL DEFAULT 'todo',
  priority      TEXT         NOT NULL DEFAULT 'medium',
  visibility    TEXT         NOT NULL DEFAULT 'all',
  assignee_id   UUID         REFERENCES public.employees(id)   ON DELETE SET NULL,
  created_by    UUID         NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  department_id UUID         REFERENCES public.departments(id) ON DELETE SET NULL,
  due_date      DATE,
  position      INTEGER      NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT tasks_status_check     CHECK (status     IN ('todo','in_progress','review','done')),
  CONSTRAINT tasks_priority_check   CHECK (priority   IN ('low','medium','high','urgent')),
  CONSTRAINT tasks_visibility_check CHECK (visibility IN ('all','department','private'))
);

CREATE INDEX idx_tasks_status     ON public.tasks(status);
CREATE INDEX idx_tasks_assignee   ON public.tasks(assignee_id);
CREATE INDEX idx_tasks_created_by ON public.tasks(created_by);
CREATE INDEX idx_tasks_department ON public.tasks(department_id);
CREATE INDEX idx_tasks_order      ON public.tasks(status, position);

CREATE TRIGGER trg_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Участники приватной задачи (кто видит помимо автора и исполнителя)
CREATE TABLE public.task_members (
  task_id     UUID        NOT NULL REFERENCES public.tasks(id)     ON DELETE CASCADE,
  employee_id UUID        NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (task_id, employee_id)
);

CREATE INDEX idx_task_members_emp ON public.task_members(employee_id);

-- ------------------------------------------------------------
-- can_see_task() — видимость задачи для текущего сотрудника.
-- SECURITY DEFINER: внутренний SELECT из task_members не запускает
-- RLS повторно, поэтому рекурсии политик нет.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_see_task(
  t_visibility TEXT,
  t_department UUID,
  t_created_by UUID,
  t_assignee   UUID,
  t_id         UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    public.get_my_role() = 'owner'
    OR t_created_by = public.get_my_employee_id()
    OR t_assignee   = public.get_my_employee_id()
    OR t_visibility = 'all'
    OR (t_visibility = 'department'
        AND t_department IS NOT NULL
        AND t_department = public.get_my_department_id())
    OR EXISTS (
      SELECT 1 FROM public.task_members m
      WHERE m.task_id = t_id
        AND m.employee_id = public.get_my_employee_id()
    );
$$;

GRANT EXECUTE ON FUNCTION public.can_see_task(TEXT,UUID,UUID,UUID,UUID) TO authenticated;

ALTER TABLE public.tasks        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_members ENABLE ROW LEVEL SECURITY;

-- SELECT — кто видит задачу
CREATE POLICY "tasks_select" ON public.tasks
  FOR SELECT TO authenticated
  USING (public.can_see_task(visibility, department_id, created_by, assignee_id, id));

-- INSERT — любой сотрудник, но только от своего имени
CREATE POLICY "tasks_insert" ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (created_by = public.get_my_employee_id());

-- UPDATE — любой, кто видит задачу (двигают/редактируют все, кто видит)
CREATE POLICY "tasks_update" ON public.tasks
  FOR UPDATE TO authenticated
  USING (public.can_see_task(visibility, department_id, created_by, assignee_id, id))
  WITH CHECK (public.can_see_task(visibility, department_id, created_by, assignee_id, id));

-- DELETE — автор или owner
CREATE POLICY "tasks_delete" ON public.tasks
  FOR DELETE TO authenticated
  USING (created_by = public.get_my_employee_id() OR public.get_my_role() = 'owner');

-- task_members: видно тем, кто видит задачу; менять — автор или owner
CREATE POLICY "task_members_select" ON public.task_members
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id));

CREATE POLICY "task_members_insert" ON public.task_members
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_id
      AND (t.created_by = public.get_my_employee_id() OR public.get_my_role() = 'owner')
  ));

CREATE POLICY "task_members_delete" ON public.task_members
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_id
      AND (t.created_by = public.get_my_employee_id() OR public.get_my_role() = 'owner')
  ));

-- Realtime — живое обновление доски у всех открытых пользователей
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;

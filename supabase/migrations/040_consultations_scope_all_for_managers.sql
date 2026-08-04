-- ── Охват «Записей» для менеджеров: own → all ────────────────────────────────
--
-- Бизнес-правило: клиент общий, не личный. При сменах 2/2 менеджеры подменяют друг
-- друга, поэтому должны видеть и вести ВСЕ записи, а не только свои. Выравниваем scope
-- для ролей уровня «employee», работающих с записями (mp, lmai): own → all.
--
-- permissions.scope — одна колонка на пару (role, resource), покрывает view/create/edit
-- разом. Для 'consultations' это даёт: видят все / создают / редактируют любую (подмена).
-- Удаление остаётся запрещённым НЕ через эту таблицу, а жёстким правилом в коде
-- (authz.ts::canDeleteConsultationHardRule — только owner), поэтому can_delete тут не важен.
--
-- targetolog / accountant — доступа к записям не имеют, их НЕ трогаем.
-- rop уже scope='team' (руководитель отдела) — оставляем как есть.

UPDATE public.permissions p
SET scope = 'all', updated_at = now()
FROM public.roles r
WHERE p.role_id = r.id
  AND p.resource = 'consultations'
  AND r.name IN ('mp', 'lmai')
  AND p.scope <> 'all';

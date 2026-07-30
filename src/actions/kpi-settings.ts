'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type ActionResult = { success: true } | { success: false; error: string }

export interface RoleOption { name: string; label: string }

export interface BonusTier {
  id: string
  tier_from: number
  tier_to: number | null
  bonus_amount: number
  sort_order: number
}

export interface BonusBlock {
  id: string
  name: string
  block_type: 'plan' | 'daily' | 'custom'
  value_label_from: string
  value_label_to: string
  sort_order: number
  tiers: BonusTier[]
}

export interface KpiItem {
  id: string
  name: string
  description: string | null
  bonus_amount: number
  sort_order: number
  is_active: boolean
}

export interface KpiRoleSetting {
  id: string
  role_name: string
  is_active: boolean
  salary_type: 'fixed' | 'per_shift'
  salary_amount: number
  rate_per_shift: number
  bonus_blocks: BonusBlock[]
  kpi_items: KpiItem[]
}

// ─── Auth guard ────────────────────────────────────────────────────────────────

async function requireOwner(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return false
  const { data } = await supabase
    .from('employees')
    .select('role')
    .eq('user_id', session.user.id)
    .single()
  return data?.role === 'owner'
}

// ─── Роли ─────────────────────────────────────────────────────────────────────

export async function getRolesForKpi(): Promise<RoleOption[]> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return []
  const { data } = await supabase
    .from('roles')
    .select('name, label')
    .is('deleted_at', null)
    .order('created_at')
  return (data ?? []) as RoleOption[]
}

// ─── Получить или создать настройки KPI для роли ──────────────────────────────

export async function getOrCreateKpiRoleSetting(roleName: string): Promise<KpiRoleSetting | null> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null
  const admin = createAdminClient()

  let { data: setting } = await admin
    .from('kpi_role_settings')
    .select('id, role_name, is_active, salary_type, salary_amount, rate_per_shift')
    .eq('role_name', roleName)
    .maybeSingle()

  if (!setting) {
    const { data: created, error } = await admin
      .from('kpi_role_settings')
      .insert({ role_name: roleName, is_active: true })
      .select('id, role_name, is_active, salary_type, salary_amount, rate_per_shift')
      .single()
    if (error || !created) return null

    // Создаём два базовых блока для новой роли
    await admin.from('kpi_bonus_blocks').insert([
      { role_setting_id: created.id, name: 'Бонус за выполнение плана', block_type: 'plan', value_label_from: '%', value_label_to: '%', sort_order: 0 },
      { role_setting_id: created.id, name: 'Ежедневный бонус', block_type: 'daily', value_label_from: 'сом', value_label_to: 'сом', sort_order: 1 },
    ])
    setting = created
  }

  // Загружаем блоки с их тирами
  const { data: blocks } = await admin
    .from('kpi_bonus_blocks')
    .select('id, name, block_type, value_label_from, value_label_to, sort_order')
    .eq('role_setting_id', setting.id)
    .order('sort_order')

  const blocksWithTiers: BonusBlock[] = await Promise.all(
    (blocks ?? []).map(async (b) => {
      const { data: tiers } = await admin
        .from('kpi_bonus_tiers')
        .select('id, tier_from, tier_to, bonus_amount, sort_order')
        .eq('block_id', b.id)
        .order('sort_order')
      return { ...b, tiers: (tiers ?? []) as BonusTier[] } as BonusBlock
    })
  )

  const { data: kpiItems } = await admin
    .from('kpi_items')
    .select('id, name, description, bonus_amount, sort_order, is_active')
    .eq('role_setting_id', setting.id)
    .eq('is_active', true)
    .order('sort_order')

  return {
    id:            setting.id as string,
    role_name:     setting.role_name as string,
    is_active:     setting.is_active as boolean,
    salary_type:   (setting.salary_type ?? 'fixed') as 'fixed' | 'per_shift',
    salary_amount: setting.salary_amount as number ?? 0,
    rate_per_shift: setting.rate_per_shift as number ?? 0,
    bonus_blocks:  blocksWithTiers,
    kpi_items:     (kpiItems ?? []) as KpiItem[],
  }
}

// ─── Сохранить настройки оклада ───────────────────────────────────────────────

export async function saveSalarySettings(
  roleSettingId: string,
  salaryType: 'fixed' | 'per_shift',
  salaryAmount: number,
  ratePerShift: number,
): Promise<ActionResult> {
  if (!await requireOwner()) return { success: false, error: 'Недостаточно прав' }
  const admin = createAdminClient()
  const { error } = await admin
    .from('kpi_role_settings')
    .update({ salary_type: salaryType, salary_amount: salaryAmount, rate_per_shift: ratePerShift })
    .eq('id', roleSettingId)
  if (error) return { success: false, error: error.message }
  revalidatePath('/dashboard/settings')
  return { success: true }
}

// ─── Сохранить тиры одного блока ─────────────────────────────────────────────

export async function saveBonusTiers(
  blockId: string,
  tiers: { tier_from: number; tier_to: number | null; bonus_amount: number }[],
): Promise<ActionResult> {
  if (!await requireOwner()) return { success: false, error: 'Недостаточно прав' }
  const admin = createAdminClient()

  const { error: delErr } = await admin.from('kpi_bonus_tiers').delete().eq('block_id', blockId)
  if (delErr) return { success: false, error: delErr.message }

  if (tiers.length > 0) {
    const rows = tiers.map((t, i) => ({
      block_id:     blockId,
      tier_from:    t.tier_from,
      tier_to:      t.tier_to,
      bonus_amount: t.bonus_amount,
      sort_order:   i,
    }))
    const { error: insErr } = await admin.from('kpi_bonus_tiers').insert(rows)
    if (insErr) return { success: false, error: insErr.message }
  }

  revalidatePath('/dashboard/settings')
  return { success: true }
}

// ─── Создать новый блок бонусов ───────────────────────────────────────────────

export async function createBonusBlock(
  roleSettingId: string,
  name: string,
  valueLabelFrom: string,
  valueLabelTo: string,
  sortOrder: number,
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  if (!await requireOwner()) return { success: false, error: 'Недостаточно прав' }
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('kpi_bonus_blocks')
    .insert({ role_setting_id: roleSettingId, name, block_type: 'custom', value_label_from: valueLabelFrom, value_label_to: valueLabelTo, sort_order: sortOrder })
    .select('id')
    .single()
  if (error || !data) return { success: false, error: error?.message ?? 'Ошибка создания блока' }
  revalidatePath('/dashboard/settings')
  return { success: true, id: data.id as string }
}

// ─── Удалить блок бонусов (CASCADE удалит тиры) ───────────────────────────────

export async function deleteBonusBlock(blockId: string): Promise<ActionResult> {
  if (!await requireOwner()) return { success: false, error: 'Недостаточно прав' }
  const admin = createAdminClient()
  const { error } = await admin.from('kpi_bonus_blocks').delete().eq('id', blockId)
  if (error) return { success: false, error: error.message }
  revalidatePath('/dashboard/settings')
  return { success: true }
}

// ─── Сохранение KPI-пунктов ───────────────────────────────────────────────────

export async function saveKpiItems(
  roleSettingId: string,
  items: { name: string; description: string | null; bonus_amount: number }[],
): Promise<ActionResult> {
  if (!await requireOwner()) return { success: false, error: 'Недостаточно прав' }
  const admin = createAdminClient()

  const { error: delErr } = await admin.from('kpi_items').delete().eq('role_setting_id', roleSettingId)
  if (delErr) return { success: false, error: delErr.message }

  const validItems = items.filter(it => it.name.trim())
  if (validItems.length > 0) {
    const rows = validItems.map((it, i) => ({
      role_setting_id: roleSettingId,
      name:            it.name.trim(),
      description:     it.description?.trim() || null,
      bonus_amount:    it.bonus_amount,
      sort_order:      i,
      is_active:       true,
    }))
    const { error: insErr } = await admin.from('kpi_items').insert(rows)
    if (insErr) return { success: false, error: insErr.message }
  }

  revalidatePath('/dashboard/settings')
  return { success: true }
}

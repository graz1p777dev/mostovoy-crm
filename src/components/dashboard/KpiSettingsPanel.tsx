'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import {
  getRolesForKpi,
  getOrCreateKpiRoleSetting,
  saveSalarySettings,
  saveBonusTiers,
  createBonusBlock,
  deleteBonusBlock,
  saveKpiItems,
  type RoleOption,
  type BonusTier,
  type KpiItem,
  type KpiRoleSetting,
} from '@/actions/kpi-settings'

// ─── Локальные типы ───────────────────────────────────────────────────────────

type LocalTier = { _id: string; tier_from: string; tier_to: string; bonus_amount: string }
type LocalKpiItem = { _id: string; name: string; description: string; bonus_amount: string }

interface LocalBonusBlock {
  id: string
  name: string
  block_type: 'plan' | 'daily' | 'custom'
  value_label_from: string
  value_label_to: string
  sort_order: number
  tiers: LocalTier[]
  dirty: boolean
  saving: boolean
}

let _uid = 1
const uid = () => `_${_uid++}`

function toLocalTiers(tiers: BonusTier[]): LocalTier[] {
  return tiers.map(t => ({
    _id:          uid(),
    tier_from:    String(t.tier_from),
    tier_to:      t.tier_to !== null ? String(t.tier_to) : '',
    bonus_amount: String(t.bonus_amount),
  }))
}

function toLocalItems(items: KpiItem[]): LocalKpiItem[] {
  return items.map(k => ({
    _id:          uid(),
    name:         k.name,
    description:  k.description ?? '',
    bonus_amount: String(k.bonus_amount),
  }))
}

// ─── Вспомогательные стили ────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e8dfe0',
  borderRadius: '12px',
  overflow: 'hidden',
}
const cardHeader: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '12px 16px',
  borderBottom: '1px solid #faf8f7',
}
const iconBox: React.CSSProperties = {
  width: '28px',
  height: '28px',
  borderRadius: '7px',
  background: '#e11d1d',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
}
const numInput: React.CSSProperties = {
  border: '1px solid #ece5e5',
  borderRadius: '6px',
  padding: '6px 7px',
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: '13px',
  color: '#1b1517',
  background: '#fdfbfb',
  textAlign: 'center' as const,
}
const bonusInput: React.CSSProperties = {
  ...numInput,
  fontWeight: 600,
  color: '#e11d1d',
  textAlign: 'right' as const,
}
const addTierBtn: React.CSSProperties = {
  margin: '7px 14px 12px',
  border: '1.4px dashed #7d7174',
  background: 'transparent',
  color: '#e11d1d',
  fontSize: '12px',
  fontWeight: 600,
  padding: '7px',
  borderRadius: '8px',
  cursor: 'pointer',
}
const delBtn: React.CSSProperties = {
  width: '22px',
  height: '22px',
  border: 'none',
  background: 'transparent',
  color: '#ddd3d3',
  cursor: 'pointer',
  fontSize: '17px',
  lineHeight: '1',
  padding: 0,
  borderRadius: '5px',
  flexShrink: 0,
}
const colLabel: React.CSSProperties = {
  fontSize: '10px',
  fontWeight: 600,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
  color: '#7d7174',
}

function fmt(n: number): string {
  if (!isFinite(n) || isNaN(n)) return '0'
  return Math.round(n).toLocaleString('ru-RU')
}

function IconBars() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M4 19V5M4 19h16M8 15v-4M12 15V8M16 15v-6" stroke="#f0eaea" strokeWidth="2" strokeLinecap="round"/></svg>
}
function IconChecklist() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 11l2 2 4-4M5 4h14v16H5z" stroke="#f0eaea" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/></svg>
}
function IconPlus() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>
}

// ─── Кнопка «Сохранить» секции ────────────────────────────────────────────────

function SaveBtn({ dirty, saving, onClick }: { dirty: boolean; saving: boolean; onClick: () => void }) {
  if (!dirty && !saving) return null
  return (
    <button
      onClick={onClick}
      disabled={saving}
      style={{
        margin: '6px 14px 12px',
        background: saving ? '#7d7174' : '#e11d1d',
        color: '#fff',
        border: 'none',
        fontSize: '12px',
        fontWeight: 600,
        padding: '7px 14px',
        borderRadius: '8px',
        cursor: saving ? 'default' : 'pointer',
        alignSelf: 'flex-end' as const,
      }}
    >
      {saving ? 'Сохраняется…' : 'Сохранить изменения'}
    </button>
  )
}

// ─── Карточка блока бонусов ───────────────────────────────────────────────────

function BonusBlockCard({
  block,
  onUpdate,
  onDelete,
  onSave,
}: {
  block: LocalBonusBlock
  onUpdate: (blockId: string, updater: (b: LocalBonusBlock) => LocalBonusBlock) => void
  onDelete: (blockId: string) => void
  onSave: (blockId: string) => void
}) {
  const addTier = () =>
    onUpdate(block.id, b => ({ ...b, dirty: true, tiers: [...b.tiers, { _id: uid(), tier_from: '0', tier_to: '', bonus_amount: '0' }] }))

  const updateTier = (_id: string, field: keyof LocalTier, value: string) =>
    onUpdate(block.id, b => ({ ...b, dirty: true, tiers: b.tiers.map(t => t._id === _id ? { ...t, [field]: value } : t) }))

  const deleteTier = (_id: string) =>
    onUpdate(block.id, b => ({ ...b, dirty: true, tiers: b.tiers.filter(t => t._id !== _id) }))

  return (
    <div style={{ ...card, marginBottom: '10px' }}>
      <div style={cardHeader}>
        <div style={iconBox}><IconBars /></div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '13px', fontWeight: 600 }}>{block.name}</div>
          <div style={{ fontSize: '11px', color: '#6b6063' }}>
            {block.block_type === 'plan' ? 'Ступени по % выполнения' :
             block.block_type === 'daily' ? 'Ступени по дневной выручке' :
             'Пользовательский блок'}
          </div>
        </div>
        {block.block_type === 'custom' && (
          <button
            onClick={() => onDelete(block.id)}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#ddd3d3', padding: '4px', borderRadius: '6px' }}
            title="Удалить блок"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        )}
      </div>

      {/* Заголовки колонок */}
      <div style={{ display: 'flex', gap: '8px', padding: '8px 14px 4px', ...colLabel }}>
        <span style={{ width: '70px' }}>От {block.value_label_from}</span>
        <span style={{ width: '70px' }}>До {block.value_label_to}</span>
        <span style={{ flex: 1, textAlign: 'right' }}>Бонус, сом</span>
        <span style={{ width: '22px' }}/>
      </div>

      {/* Строки тиров */}
      {block.tiers.map(t => (
        <div key={t._id} style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '4px 14px', borderTop: '1px solid #fdfbfb' }}>
          <input
            type="number"
            value={t.tier_from}
            onChange={e => updateTier(t._id, 'tier_from', e.target.value)}
            style={{ ...numInput, width: '70px' }}
          />
          <input
            type="number"
            value={t.tier_to}
            placeholder="∞"
            onChange={e => updateTier(t._id, 'tier_to', e.target.value)}
            style={{ ...numInput, width: '70px' }}
          />
          <input
            type="number"
            value={t.bonus_amount}
            onChange={e => updateTier(t._id, 'bonus_amount', e.target.value)}
            style={{ ...bonusInput, flex: 1, minWidth: 0 }}
          />
          <button onClick={() => deleteTier(t._id)} style={delBtn}>×</button>
        </div>
      ))}

      {block.tiers.length === 0 && (
        <div style={{ padding: '12px 14px', color: '#7d7174', fontSize: '12.5px' }}>Нет ступеней — нажмите «+ Добавить»</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <button onClick={addTier} style={addTierBtn}>+ Добавить ступень</button>
        <SaveBtn dirty={block.dirty} saving={block.saving} onClick={() => onSave(block.id)} />
      </div>
    </div>
  )
}

// ─── Основной компонент ───────────────────────────────────────────────────────

export function KpiSettingsPanel() {
  const [roles, setRoles]               = useState<RoleOption[]>([])
  const [selectedRole, setSelectedRole] = useState('')
  const [settingId, setSettingId]       = useState<string | null>(null)
  const [loading, setLoading]           = useState(false)

  // Оклад
  const [salaryType, setSalaryType]         = useState<'fixed' | 'per_shift'>('fixed')
  const [salaryAmount, setSalaryAmount]     = useState('')
  const [ratePerShift, setRatePerShift]     = useState('')
  const [salaryDirty, setSalaryDirty]       = useState(false)
  const [salarySaving, setSalarySaving]     = useState(false)

  // Рабочих дней — строка, чтобы не блокировать очистку
  const [workDaysStr, setWorkDaysStr] = useState('22')

  // Блоки бонусов
  const [bonusBlocks, setBonusBlocks] = useState<LocalBonusBlock[]>([])

  // Новый блок
  const [showAddBlock, setShowAddBlock]       = useState(false)
  const [newBlockName, setNewBlockName]       = useState('')
  const [newBlockLabelFrom, setNewBlockLabelFrom] = useState('%')
  const [newBlockLabelTo, setNewBlockLabelTo]     = useState('%')
  const [addingBlock, setAddingBlock]         = useState(false)

  // KPI-пункты
  const [kpiItems, setKpiItems]     = useState<LocalKpiItem[]>([])
  const [itemsDirty, setItemsDirty] = useState(false)
  const [itemsSaving, setItemsSaving] = useState(false)

  // Refs для предотвращения двойного вызова
  const loadingRef = useRef(false)

  // Объявляем до loadRole, чтобы линтер не видел forward-reference
  const applySettingToState = useCallback((setting: KpiRoleSetting) => {
    setSettingId(setting.id)
    setSalaryType(setting.salary_type)
    setSalaryAmount(String(setting.salary_amount))
    setRatePerShift(String(setting.rate_per_shift))
    setBonusBlocks(setting.bonus_blocks.map(b => ({
      id:               b.id,
      name:             b.name,
      block_type:       b.block_type,
      value_label_from: b.value_label_from,
      value_label_to:   b.value_label_to,
      sort_order:       b.sort_order,
      tiers:            toLocalTiers(b.tiers),
      dirty:            false,
      saving:           false,
    })))
    setKpiItems(toLocalItems(setting.kpi_items))
  }, [])

  // ── Загрузка ролей ──────────────────────────────────────────────────────────
  useEffect(() => {
    getRolesForKpi().then(data => {
      setRoles(data)
      if (data.length > 0) setSelectedRole(data[0].name)
    })
  }, [])

  // ── Загрузка данных роли ────────────────────────────────────────────────────
  const loadRole = useCallback(async (roleName: string) => {
    if (!roleName || loadingRef.current) return
    loadingRef.current = true
    setLoading(true)
    setSalaryDirty(false)
    setItemsDirty(false)
    setShowAddBlock(false)

    const setting = await getOrCreateKpiRoleSetting(roleName)
    loadingRef.current = false

    if (!setting) {
      setSettingId(null)
      setLoading(false)
      return
    }

    applySettingToState(setting)
    setLoading(false)
  }, [applySettingToState])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (selectedRole) void loadRole(selectedRole)
  }, [selectedRole, loadRole])

  // ── Сохранение оклада ───────────────────────────────────────────────────────
  const handleSaveSalary = async () => {
    if (!settingId) return
    setSalarySaving(true)
    const res = await saveSalarySettings(
      settingId,
      salaryType,
      Number(salaryAmount) || 0,
      Number(ratePerShift) || 0,
    )
    setSalarySaving(false)
    if (res.success) {
      setSalaryDirty(false)
      toast.success('Оклад сохранён')
    }
    else toast.error(res.error)
  }

  // ── Обновление и сохранение блоков бонусов ─────────────────────────────────

  const updateBlock = (blockId: string, updater: (b: LocalBonusBlock) => LocalBonusBlock) =>
    setBonusBlocks(bs => bs.map(b => b.id === blockId ? updater(b) : b))

  const handleSaveBlock = async (blockId: string) => {
    const block = bonusBlocks.find(b => b.id === blockId)
    if (!block) return
    updateBlock(blockId, b => ({ ...b, saving: true }))
    const tiers = block.tiers.map(t => ({
      tier_from:    Number(t.tier_from) || 0,
      tier_to:      t.tier_to !== '' ? Number(t.tier_to) : null,
      bonus_amount: Number(t.bonus_amount) || 0,
    }))
    const res = await saveBonusTiers(blockId, tiers)
    updateBlock(blockId, b => ({ ...b, saving: false, dirty: !res.success }))
    if (res.success) {
      toast.success(`«${block.name}» сохранён`)
    }
    else toast.error(res.error)
  }

  const handleDeleteBlock = async (blockId: string) => {
    const block = bonusBlocks.find(b => b.id === blockId)
    if (!block) return
    if (!confirm(`Удалить блок «${block.name}» и все его ступени?`)) return
    const res = await deleteBonusBlock(blockId)
    if (res.success) {
      setBonusBlocks(bs => bs.filter(b => b.id !== blockId))
      toast.success('Блок удалён')
    } else {
      toast.error(res.error)
    }
  }

  // ── Создание нового блока ───────────────────────────────────────────────────
  const handleCreateBlock = async () => {
    if (!settingId || !newBlockName.trim()) return
    setAddingBlock(true)
    const nextOrder = bonusBlocks.length
    const res = await createBonusBlock(settingId, newBlockName.trim(), newBlockLabelFrom.trim() || '%', newBlockLabelTo.trim() || '%', nextOrder)
    setAddingBlock(false)
    if (!res.success) { toast.error(res.error); return }
    setBonusBlocks(bs => [...bs, {
      id:               res.id,
      name:             newBlockName.trim(),
      block_type:       'custom',
      value_label_from: newBlockLabelFrom.trim() || '%',
      value_label_to:   newBlockLabelTo.trim() || '%',
      sort_order:       nextOrder,
      tiers:            [],
      dirty:            false,
      saving:           false,
    }])
    setNewBlockName('')
    setNewBlockLabelFrom('%')
    setNewBlockLabelTo('%')
    setShowAddBlock(false)
    toast.success('Блок добавлен')
  }

  // ── KPI-пункты ──────────────────────────────────────────────────────────────
  const addKpiItem = () => { setKpiItems(k => [...k, { _id: uid(), name: '', description: '', bonus_amount: '0' }]); setItemsDirty(true) }
  const updateKpiItem = (_id: string, field: keyof LocalKpiItem, value: string) => { setKpiItems(k => k.map(r => r._id === _id ? { ...r, [field]: value } : r)); setItemsDirty(true) }
  const deleteKpiItem = (_id: string) => { setKpiItems(k => k.filter(r => r._id !== _id)); setItemsDirty(true) }

  const handleSaveItems = async () => {
    if (!settingId) return
    setItemsSaving(true)
    const res = await saveKpiItems(settingId, kpiItems.map(k => ({
      name:         k.name,
      description:  k.description || null,
      bonus_amount: Number(k.bonus_amount) || 0,
    })))
    setItemsSaving(false)
    if (res.success) {
      setItemsDirty(false)
      toast.success('KPI-пункты сохранены')
    }
    else toast.error(res.error)
  }

  // ── Расчёт «Зарплата в идеале» ─────────────────────────────────────────────
  const workDays = Number(workDaysStr) || 0
  const salaryCalc = salaryType === 'fixed'
    ? (Number(salaryAmount) || 0)
    : (Number(ratePerShift) || 0) * workDays

  const kpiTotal = kpiItems.reduce((s, k) => s + (Number(k.bonus_amount) || 0), 0)

  const blocksMaxBonuses = bonusBlocks.map(b => ({
    name: b.name,
    max:  b.tiers.reduce((m, t) => Math.max(m, Number(t.bonus_amount) || 0), 0),
  }))
  const totalBlocksBonus = blocksMaxBonuses.reduce((s, b) => s + b.max, 0)
  const ideal = salaryCalc + totalBlocksBonus + kpiTotal

  const selectedRoleLabel = roles.find(r => r.name === selectedRole)?.label ?? selectedRole

  if (roles.length === 0) {
    return <div style={{ ...card, padding: '20px', color: '#7d7174', fontSize: '13px' }}>Загрузка ролей…</div>
  }

  return (
    <div style={{ fontFamily: "'IBM Plex Sans', system-ui, sans-serif", color: '#1b1517' }}>

      {/* ── Заголовок ── */}
      <div style={{
        background: '#ffffff', border: '1px solid #ece5e5', borderRadius: '18px', padding: '14px 18px',
        display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px',
        boxShadow: '0 1px 2px rgba(28,20,22,0.04)',
      }}>
        <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#e11d1d', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#f0eaea" strokeWidth="1.6"/><circle cx="12" cy="12" r="5" stroke="rgba(255,255,255,0.62)" strokeWidth="1.6"/><circle cx="12" cy="12" r="1.6" fill="#f0eaea"/></svg>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '15px', fontWeight: 600, color: '#1b1517' }}>Настройка KPI</div>
          <div style={{ fontSize: '11px', color: '#7d7174' }}>Мотивация и премии · {selectedRoleLabel}</div>
        </div>
      </div>

      {/* ── Селектор роли ── */}
      <div style={{ ...card, display: 'flex', alignItems: 'center', gap: '12px', padding: '11px 14px', marginBottom: '10px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '140px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.7px', color: '#e11d1d' }}>Роль</div>
          <div style={{ fontSize: '11px', color: '#6b6063' }}>Настройки ниже относятся к этой роли</div>
        </div>
        <div style={{ position: 'relative', minWidth: '200px' }}>
          <select
            value={selectedRole}
            onChange={e => setSelectedRole(e.target.value)}
            style={{ width: '100%', appearance: 'none', background: '#fdfbfb', border: '1.5px solid #e11d1d', borderRadius: '9px', padding: '9px 34px 9px 11px', fontSize: '13.5px', fontWeight: 600, color: '#1b1517', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            {roles.map(r => <option key={r.name} value={r.name}>{r.label}</option>)}
          </select>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ position: 'absolute', right: '11px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
            <path d="M5 9l7 7 7-7" stroke="#e11d1d" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        {/* Рабочие дни */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', background: '#faf8f7', border: '1px solid #e8dfe0', borderRadius: '9px', padding: '7px 11px' }}>
          <span style={{ fontSize: '11.5px', color: '#574d4f', whiteSpace: 'nowrap' }}>Раб. дней:</span>
          <input
            type="number"
            value={workDaysStr}
            onChange={e => setWorkDaysStr(e.target.value)}
            style={{ width: '44px', border: '1px solid #e8dfe0', borderRadius: '6px', padding: '4px 5px', fontFamily: "'IBM Plex Mono', monospace", fontSize: '13px', fontWeight: 600, color: '#1b1517', textAlign: 'center', background: '#fff' }}
          />
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '28px', color: '#7d7174', fontSize: '13px', textAlign: 'center' }}>Загрузка настроек…</div>
      ) : (
        <>
          {/* ── Оклад ── */}
          <div style={{ ...card, marginBottom: '10px' }}>
            <div style={cardHeader}>
              <div style={iconBox}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="3" y="6" width="18" height="12" rx="2" stroke="#f0eaea" strokeWidth="1.7"/><circle cx="12" cy="12" r="2.4" stroke="#f0eaea" strokeWidth="1.7"/></svg>
              </div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600 }}>Оклад</div>
                <div style={{ fontSize: '11px', color: '#6b6063' }}>Ручной ввод · тип оплаты выбирается ниже</div>
              </div>
            </div>
            <div style={{ padding: '12px 14px' }}>
              {/* Тип оклада */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                {(['fixed', 'per_shift'] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => { setSalaryType(type); setSalaryDirty(true) }}
                    style={{
                      flex: 1,
                      padding: '9px 6px',
                      borderRadius: '9px',
                      border: salaryType === type ? '2px solid #e11d1d' : '1.5px solid #e8dfe0',
                      background: salaryType === type ? '#faf8f7' : '#fdfbfb',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    <div style={{ fontSize: '12.5px', fontWeight: 600, color: salaryType === type ? '#e11d1d' : '#574d4f' }}>
                      {type === 'fixed' ? 'Фиксированная сумма' : 'За выход (сдельно)'}
                    </div>
                    <div style={{ fontSize: '10.5px', color: '#7d7174', marginTop: '2px' }}>
                      {type === 'fixed' ? 'Одна сумма в месяц' : 'Ставка × кол-во выходов'}
                    </div>
                  </button>
                ))}
              </div>
              {/* Поле ввода */}
              {salaryType === 'fixed' ? (
                <div>
                  <div style={{ fontSize: '11px', color: '#6b6063', marginBottom: '5px' }}>Сумма в месяц, сом</div>
                  <input
                    type="number"
                    value={salaryAmount}
                    onChange={e => { setSalaryAmount(e.target.value); setSalaryDirty(true) }}
                    placeholder="например 10000"
                    style={{ ...numInput, width: '100%', textAlign: 'left', fontSize: '18px', fontWeight: 700, padding: '10px 12px', boxSizing: 'border-box' }}
                  />
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '11px', color: '#6b6063', marginBottom: '5px' }}>Ставка за один выход, сом</div>
                    <input
                      type="number"
                      value={ratePerShift}
                      onChange={e => { setRatePerShift(e.target.value); setSalaryDirty(true) }}
                      placeholder="например 1000"
                      style={{ ...numInput, width: '100%', textAlign: 'left', fontSize: '18px', fontWeight: 700, padding: '10px 12px', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ paddingBottom: '10px', color: '#6b6063', fontSize: '13px' }}>
                    × {workDays || '?'} дн. = <strong style={{ color: '#e11d1d', fontFamily: "'IBM Plex Mono', monospace" }}>{fmt((Number(ratePerShift) || 0) * workDays)}</strong>
                  </div>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 14px 10px' }}>
              <SaveBtn dirty={salaryDirty} saving={salarySaving} onClick={handleSaveSalary} />
            </div>
          </div>

          {/* ── Блоки бонусов ── */}
          <div style={{ marginBottom: '10px' }}>
            {bonusBlocks.map(block => (
              <BonusBlockCard
                key={block.id}
                block={block}
                onUpdate={updateBlock}
                onDelete={handleDeleteBlock}
                onSave={handleSaveBlock}
              />
            ))}

            {/* Форма добавления нового блока */}
            {showAddBlock ? (
              <div style={{ ...card, padding: '14px', marginBottom: '10px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '10px' }}>Новый блок бонусов</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px', gap: '8px', marginBottom: '10px' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: '#6b6063', marginBottom: '4px' }}>Название блока *</div>
                    <input
                      type="text"
                      value={newBlockName}
                      onChange={e => setNewBlockName(e.target.value)}
                      placeholder="Например: Бонус за конверсию"
                      style={{ width: '100%', border: '1px solid #ece5e5', borderRadius: '7px', padding: '8px 10px', fontSize: '13px', fontFamily: 'inherit', color: '#1b1517', background: '#fdfbfb', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: '#6b6063', marginBottom: '4px' }}>Подпись «От»</div>
                    <input
                      type="text"
                      value={newBlockLabelFrom}
                      onChange={e => setNewBlockLabelFrom(e.target.value)}
                      placeholder="%"
                      style={{ width: '100%', border: '1px solid #ece5e5', borderRadius: '7px', padding: '8px 10px', fontSize: '13px', fontFamily: 'inherit', color: '#1b1517', background: '#fdfbfb', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: '#6b6063', marginBottom: '4px' }}>Подпись «До»</div>
                    <input
                      type="text"
                      value={newBlockLabelTo}
                      onChange={e => setNewBlockLabelTo(e.target.value)}
                      placeholder="%"
                      style={{ width: '100%', border: '1px solid #ece5e5', borderRadius: '7px', padding: '8px 10px', fontSize: '13px', fontFamily: 'inherit', color: '#1b1517', background: '#fdfbfb', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={handleCreateBlock}
                    disabled={addingBlock || !newBlockName.trim()}
                    style={{ background: '#e11d1d', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '12.5px', fontWeight: 600, cursor: addingBlock || !newBlockName.trim() ? 'default' : 'pointer', opacity: addingBlock || !newBlockName.trim() ? 0.6 : 1 }}
                  >
                    {addingBlock ? 'Создание…' : 'Создать блок'}
                  </button>
                  <button
                    onClick={() => setShowAddBlock(false)}
                    style={{ background: 'transparent', color: '#6b6063', border: '1px solid #e8dfe0', borderRadius: '8px', padding: '8px 14px', fontSize: '12.5px', cursor: 'pointer' }}
                  >
                    Отмена
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowAddBlock(true)}
                style={{ width: '100%', border: '1.5px dashed #7d7174', background: 'transparent', color: '#e11d1d', fontSize: '13px', fontWeight: 600, padding: '12px', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginBottom: '10px' }}
              >
                <IconPlus /> Добавить блок бонусов
              </button>
            )}
          </div>

          {/* ── KPI-пункты ── */}
          <div style={{ ...card, marginBottom: '10px' }}>
            <div style={cardHeader}>
              <div style={iconBox}><IconChecklist /></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: 600 }}>KPI-пункты</div>
                <div style={{ fontSize: '11px', color: '#6b6063' }}>Именованные задачи с фиксированным бонусом</div>
              </div>
              <button
                onClick={addKpiItem}
                style={{ border: 'none', background: '#e11d1d', color: '#fff', fontSize: '12px', fontWeight: 600, padding: '7px 12px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
              >
                <IconPlus /> Добавить
              </button>
            </div>
            <div style={{ display: 'flex', gap: '8px', padding: '8px 14px 4px', ...colLabel }}>
              <span style={{ width: '200px' }}>Название</span>
              <span style={{ flex: 1 }}>Описание</span>
              <span style={{ width: '100px', textAlign: 'right' }}>Бонус, сом</span>
              <span style={{ width: '22px' }}/>
            </div>
            {kpiItems.map(k => (
              <div key={k._id} style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '5px 14px', borderTop: '1px solid #fdfbfb' }}>
                <input
                  type="text"
                  value={k.name}
                  placeholder="Название"
                  onChange={e => updateKpiItem(k._id, 'name', e.target.value)}
                  style={{ width: '200px', border: '1px solid #ece5e5', borderRadius: '6px', padding: '7px 9px', fontSize: '13px', fontWeight: 500, color: '#1b1517', background: '#fdfbfb', fontFamily: 'inherit' }}
                />
                <input
                  type="text"
                  value={k.description}
                  placeholder="Условие"
                  onChange={e => updateKpiItem(k._id, 'description', e.target.value)}
                  style={{ flex: 1, minWidth: 0, border: '1px solid #ece5e5', borderRadius: '6px', padding: '7px 9px', fontSize: '12.5px', color: '#574d4f', background: '#fdfbfb', fontFamily: 'inherit' }}
                />
                <input
                  type="number"
                  value={k.bonus_amount}
                  onChange={e => updateKpiItem(k._id, 'bonus_amount', e.target.value)}
                  style={{ ...bonusInput, width: '100px' }}
                />
                <button onClick={() => deleteKpiItem(k._id)} style={delBtn}>×</button>
              </div>
            ))}
            {kpiItems.length === 0 && (
              <div style={{ padding: '14px', color: '#7d7174', fontSize: '12.5px', textAlign: 'center' }}>Нет пунктов</div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 14px 10px', marginTop: '4px' }}>
              <SaveBtn dirty={itemsDirty} saving={itemsSaving} onClick={handleSaveItems} />
            </div>
          </div>

          {/* ── Зарплата в идеале ── */}
          <div style={{ background: '#faf8f7', border: '1px solid #ece5e5', borderRadius: '18px', padding: '14px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#e11d1d" strokeWidth="2"/><path d="M9.5 9.5h3.2a1.8 1.8 0 010 3.6H10m0 0h3a1.8 1.8 0 010 3.6H9.5M11 7v10.5" stroke="rgba(255,255,255,0.72)" strokeWidth="1.4" strokeLinecap="round"/></svg>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#1b1517' }}>Зарплата в идеале</span>
              <span style={{ fontSize: '11px', color: '#7d7174' }}>При максимальных показателях и всех KPI</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
              {/* Оклад */}
              <div style={{ flex: 1, minWidth: '110px', background: '#ffffff', border: '1px solid #ece5e5', borderRadius: '8px', padding: '10px 12px' }}>
                <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#7d7174' }}>
                  {salaryType === 'fixed' ? 'Оклад' : `Выходы × ${workDays}`}
                </div>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '15px', fontWeight: 600, color: '#fff', marginTop: '3px' }}>{fmt(salaryCalc)}</div>
              </div>

              {/* Каждый блок бонусов */}
              {blocksMaxBonuses.map((b, i) => (
                <>
                  <div key={`sep-${i}`} style={{ color: '#8a7d80', fontSize: '16px' }}>+</div>
                  <div key={`blk-${i}`} style={{ flex: 1, minWidth: '110px', background: '#ffffff', border: '1px solid #ece5e5', borderRadius: '8px', padding: '10px 12px' }}>
                    <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.4px', color: '#7d7174' }} title={b.name}>{b.name.length > 20 ? b.name.slice(0, 18) + '…' : b.name}</div>
                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '15px', fontWeight: 600, color: '#fff', marginTop: '3px' }}>{fmt(b.max)}</div>
                  </div>
                </>
              ))}

              <div style={{ color: '#a19698', fontSize: '16px' }}>+</div>
              <div style={{ flex: 1, minWidth: '100px', background: '#ffffff', border: '1px solid #ece5e5', borderRadius: '8px', padding: '10px 12px' }}>
                <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#7d7174' }}>KPI-пункты</div>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '15px', fontWeight: 600, color: '#fff', marginTop: '3px' }}>{fmt(kpiTotal)}</div>
              </div>

              <div style={{ color: '#a19698', fontSize: '16px' }}>=</div>
              <div style={{ flex: 1.5, minWidth: '130px', background: '#e11d1d', borderRadius: '8px', padding: '10px 14px' }}>
                <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#e8dfe0' }}>Итого</div>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '20px', fontWeight: 700, color: '#fff', marginTop: '2px' }}>
                  {fmt(ideal)} <span style={{ fontSize: '11px', fontWeight: 400, color: '#e8dfe0' }}>сом</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

'use client'

// Модалка заведения/редактирования партнёра (раздел «Управление → Партнёры»).
// Тип — из редактируемого справочника partner_types (+ добавить новый прямо здесь).

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Handshake, X } from 'lucide-react'
import { savePartner } from '@/actions/partners'
import type { Partner, PartnerTypeItem, PartnerStatus } from '@/types'

const box: React.CSSProperties = {
  width: '100%', padding: '10px 12px', border: '1px solid var(--line)', borderRadius: '10px',
  fontSize: '14px', background: 'var(--surface)', color: 'var(--ink)', boxSizing: 'border-box', fontFamily: 'inherit',
}
const lbl: React.CSSProperties = { fontSize: '12px', fontWeight: 600, color: 'var(--ink-3)', display: 'block', marginBottom: '6px' }

export default function PartnerModal({
  partner, types, onAddType, onClose, onSaved,
}: {
  partner: Partner | null
  types: PartnerTypeItem[]
  onAddType: (name: string) => Promise<boolean>
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName]       = useState(partner?.name ?? '')
  const [type, setType]       = useState(partner?.type ?? (types[0]?.name ?? 'Другое'))
  const [terms, setTerms]     = useState(partner?.terms ?? '')
  const [contact, setContact] = useState(partner?.contact ?? '')
  const [status, setStatus]   = useState<PartnerStatus>(partner?.status ?? 'active')
  const [addingType, setAddingType] = useState(false)
  const [newType, setNewType] = useState('')
  const [saving, startSaving] = useTransition()

  const addType = () => {
    const n = newType.trim()
    if (!n) return
    startSaving(async () => {
      const ok = await onAddType(n)
      if (ok) { setType(n); setNewType(''); setAddingType(false) }
    })
  }

  const save = () => {
    if (!name.trim()) { toast.error('Укажите название'); return }
    startSaving(async () => {
      const res = await savePartner(partner?.id ?? null, { name, type, terms: terms || null, contact: contact || null, status })
      if (res.success) { toast.success(partner ? 'Партнёр обновлён' : 'Партнёр добавлен'); onSaved() }
      else toast.error(res.error)
    })
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(27,21,23,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: '20px', width: '100%', maxWidth: '520px', maxHeight: '92vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '18px 24px', background: 'var(--surface-2)', borderBottom: '1px solid var(--line)', borderRadius: '20px 20px 0 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span className="grid h-10 w-10 place-items-center rounded-2xl" style={{ background: 'var(--brand-soft)' }} aria-hidden>
              <Handshake size={18} style={{ color: 'var(--brand-ink)' }} />
            </span>
            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--ink)' }}>{partner ? 'Редактировать партнёра' : 'Новый партнёр'}</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--ink-3)', cursor: 'pointer' }}><X size={18} /></button>
        </div>

        <div style={{ padding: '22px 24px', display: 'grid', gap: '16px' }}>
          <label><span style={lbl}>Название *</span><input value={name} onChange={e => setName(e.target.value)} placeholder="имя / бренд партнёра" style={box} /></label>

          <div>
            <span style={lbl}>Тип</span>
            {!addingType ? (
              <div style={{ display: 'flex', gap: '8px' }}>
                <select value={type} onChange={e => setType(e.target.value)} style={box}>
                  {types.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                  {!types.some(t => t.name === type) && <option value={type}>{type}</option>}
                </select>
                <button onClick={() => setAddingType(true)} style={{ whiteSpace: 'nowrap', border: '1px solid var(--line)', background: 'var(--surface-2)', color: 'var(--brand-ink)', borderRadius: '10px', padding: '0 14px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>＋ тип</button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '8px' }}>
                <input value={newType} onChange={e => setNewType(e.target.value)} placeholder="напр. Салон красоты" style={box} autoFocus />
                <button onClick={addType} disabled={saving} style={{ whiteSpace: 'nowrap', border: 'none', background: 'var(--accent-deep)', color: 'var(--on-brand)', borderRadius: '10px', padding: '0 14px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>Добавить</button>
                <button onClick={() => { setAddingType(false); setNewType('') }} style={{ border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink-3)', borderRadius: '10px', padding: '0 12px', fontSize: '13px', cursor: 'pointer' }}>✕</button>
              </div>
            )}
          </div>

          <label><span style={lbl}>Условия</span><input value={terms} onChange={e => setTerms(e.target.value)} placeholder="комиссия / бартер / …" style={box} /></label>
          <label><span style={lbl}>Контакт</span><input value={contact} onChange={e => setContact(e.target.value)} placeholder="телефон или мессенджер" style={box} /></label>
          <label><span style={lbl}>Статус</span>
            <select value={status} onChange={e => setStatus(e.target.value as PartnerStatus)} style={box}>
              <option value="active">Активен</option>
              <option value="inactive">Неактивен</option>
            </select>
          </label>

          {/* Задел на будущее: у партнёра появится личный кабинет для самостоятельного ввода */}
          <div style={{ fontSize: '12px', color: 'var(--ink-3)', background: 'var(--surface-2)', border: '1px dashed var(--line-strong)', borderRadius: '10px', padding: '10px 12px' }}>
            🔒 Личный кабинет партнёра (вход и самостоятельный ввод обращений) — появится позже.
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', padding: '0 24px 22px' }}>
          <button onClick={onClose} style={{ border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink-3)', borderRadius: '10px', padding: '10px 18px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>Отмена</button>
          <button onClick={save} disabled={saving} style={{ border: 'none', background: saving ? 'var(--ink-3)' : 'var(--accent-deep)', color: 'var(--on-brand)', borderRadius: '10px', padding: '10px 22px', fontSize: '14px', fontWeight: 600, cursor: saving ? 'default' : 'pointer' }}>{saving ? 'Сохранение…' : 'Сохранить'}</button>
        </div>
      </div>
    </div>
  )
}

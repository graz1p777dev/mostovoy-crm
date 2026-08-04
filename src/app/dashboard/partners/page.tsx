'use client'

// Раздел «Управление → Партнёры» — справочник партнёров (как «Сотрудники»).
// Заведение/редактирование/деактивация здесь; в декомпозиции — только аналитика.

import { useEffect, useState, useMemo, useTransition } from 'react'
import { toast } from 'sonner'
import { Plus, Search, Handshake } from 'lucide-react'
import {
  getPartnersPageData, savePartner, savePartnerType, deletePartnerType,
  type PartnersPageData,
} from '@/actions/partners'
import type { Partner } from '@/types'
import PartnerModal from '@/components/partners/PartnerModal'
import PageLoader from '@/components/common/PageLoader'

const box: React.CSSProperties = {
  padding: '9px 12px', border: '1px solid var(--line)', borderRadius: '10px', fontSize: '14px',
  background: 'var(--surface)', color: 'var(--ink)', boxSizing: 'border-box', fontFamily: 'inherit',
}

export default function PartnersPage() {
  const [data, setData] = useState<PartnersPageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)
  const [search, setSearch] = useState('')
  const [fType, setFType] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Partner | null>(null)
  const [, startAction] = useTransition()

  useEffect(() => {
    let cancelled = false
    getPartnersPageData().then(d => { if (!cancelled) { setData(d); setLoading(false) } })
    return () => { cancelled = true }
  }, [reloadKey])

  const reload = () => setReloadKey(k => k + 1)
  const partners = useMemo(() => data?.partners ?? [], [data])
  const types = data?.types ?? []
  const canEdit = data?.canEdit ?? false

  const shown = useMemo(() => partners.filter(p =>
    (!search || p.name.toLowerCase().includes(search.toLowerCase())) &&
    (!fType || p.type === fType) &&
    (!fStatus || p.status === fStatus)
  ), [partners, search, fType, fStatus])

  const addType = async (name: string): Promise<boolean> => {
    const res = await savePartnerType(null, name)
    if (res.success) { toast.success('Тип добавлен'); reload(); return true }
    toast.error(res.error); return false
  }
  const toggleStatus = (p: Partner) => startAction(async () => {
    const res = await savePartner(p.id, { name: p.name, type: p.type, terms: p.terms, contact: p.contact, status: p.status === 'active' ? 'inactive' : 'active' })
    if (res.success) { toast.success(p.status === 'active' ? 'Деактивирован' : 'Активирован'); reload() }
    else toast.error(res.error)
  })
  const removeType = (id: string) => startAction(async () => {
    const res = await deletePartnerType(id)
    if (res.success) { toast.success('Тип удалён'); reload() } else toast.error(res.error)
  })

  if (loading) return <PageLoader />
  if (!data) return (
    <div className="flex flex-col gap-4 p-4 md:p-8">
      <div
        className="rounded-2xl px-6 py-14 text-center"
        style={{ border: '1px solid var(--line)', background: 'var(--surface)' }}
      >
        <div className="text-[16px] font-bold" style={{ color: 'var(--ink)' }}>Нет доступа</div>
        <p className="mt-2 text-[13px]" style={{ color: 'var(--ink-3)' }}>Раздел «Партнёры» доступен при праве на маркетинг.</p>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col gap-4 p-4 md:p-8">

      {/* Шапка */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="kicker">Управление</p>
          <h1 className="block-title span-rule mt-2">Партнёры</h1>
          <p className="mt-2 max-w-xl text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
            Справочник партнёров-источников обращений: заведение, редактирование, статус.
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => { setEditing(null); setModalOpen(true) }}
            className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold"
            style={{ background: 'var(--accent-deep)', color: 'var(--on-brand)', border: 'none', cursor: 'pointer' }}
          >
            <Plus size={17} /> Добавить партнёра
          </button>
        )}
      </header>

      {/* Тулбар: поиск + фильтры */}
      <div className="flex flex-wrap gap-3">
        <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-4)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по названию…" style={{ ...box, width: '100%', paddingLeft: '36px' }} />
        </div>
        <select value={fType} onChange={e => setFType(e.target.value)} style={{ ...box, minWidth: '160px' }}>
          <option value="">Все типы</option>
          {types.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
        </select>
        <select value={fStatus} onChange={e => setFStatus(e.target.value)} style={{ ...box, minWidth: '150px' }}>
          <option value="">Все статусы</option>
          <option value="active">Активные</option>
          <option value="inactive">Неактивные</option>
        </select>
      </div>

      {/* Сетка карточек */}
      {shown.length === 0 ? (
        <div
          className="flex flex-col items-center gap-2.5 rounded-2xl px-6 py-14 text-center"
          style={{ border: '1px dashed var(--line-strong)', background: 'var(--surface)' }}
        >
          <span className="grid h-12 w-12 place-items-center rounded-2xl" style={{ background: 'var(--brand-soft)' }} aria-hidden>
            <Handshake size={22} style={{ color: 'var(--brand-ink)' }} />
          </span>
          <b className="text-[15px]" style={{ color: 'var(--ink)' }}>Партнёры не найдены</b>
          <span className="max-w-md text-[12.5px]" style={{ color: 'var(--ink-3)' }}>Измените запрос или снимите фильтры.</span>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
          {shown.map(p => {
            const inactive = p.status !== 'active'
            return (
              <div
                key={p.id}
                className="card-hover rounded-2xl"
                style={{ background: 'var(--surface)', border: '1px solid var(--line)', padding: '18px 20px', opacity: inactive ? 0.7 : 1 }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                  <div style={{ fontSize: '15.5px', fontWeight: 700, color: 'var(--ink)' }}>{p.name}</div>
                  <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 9px', borderRadius: '999px', whiteSpace: 'nowrap', background: inactive ? 'var(--surface-2)' : 'var(--ok-soft-alt)', color: inactive ? 'var(--ink-3)' : 'var(--series-positive-text)' }}>
                    {inactive ? 'Неактивен' : 'Активен'}
                  </span>
                </div>
                <span style={{ display: 'inline-block', marginTop: '9px', fontSize: '11.5px', fontWeight: 600, color: 'var(--brand-ink)', background: 'var(--brand-soft)', padding: '3px 10px', borderRadius: '999px' }}>{p.type}</span>
                <div style={{ marginTop: '12px', display: 'grid', gap: '5px', fontSize: '12.5px', color: 'var(--ink-2)' }}>
                  <div>Условия: <span style={{ color: p.terms ? 'var(--ink)' : 'var(--ink-4)' }}>{p.terms || '—'}</span></div>
                  <div>Контакт: <span style={{ color: p.contact ? 'var(--ink)' : 'var(--ink-4)' }}>{p.contact || '—'}</span></div>
                </div>
                {canEdit && (
                  <div style={{ display: 'flex', gap: '14px', marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--line)' }}>
                    <button onClick={() => { setEditing(p); setModalOpen(true) }} style={{ background: 'transparent', border: 'none', color: 'var(--brand-ink)', fontWeight: 600, cursor: 'pointer', fontSize: '13px' }}>Редактировать</button>
                    <button onClick={() => toggleStatus(p)} style={{ background: 'transparent', border: 'none', color: inactive ? 'var(--series-positive-text)' : 'var(--brand-ink)', fontWeight: 600, cursor: 'pointer', fontSize: '13px' }}>{inactive ? 'Активировать' : 'Деактивировать'}</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Справочник типов (владелец) */}
      {canEdit && (
        <div className="rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--line)', padding: '18px 20px' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)', marginBottom: '4px' }}>Типы партнёров</div>
          <p style={{ fontSize: '12.5px', color: 'var(--ink-3)', margin: '0 0 12px' }}>Справочник типов — можно добавлять свои прямо в форме партнёра. Базовые типы удалить нельзя.</p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {types.map(t => (
              <span key={t.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '12.5px', fontWeight: 600, color: 'var(--ink)', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: '999px', padding: '5px 12px' }}>
                {t.name}
                {!t.is_system && <button onClick={() => removeType(t.id)} title="Удалить тип" style={{ background: 'transparent', border: 'none', color: 'var(--brand-ink)', cursor: 'pointer', fontWeight: 700, lineHeight: 1 }}>✕</button>}
              </span>
            ))}
          </div>
        </div>
      )}

      {modalOpen && (
        <PartnerModal
          partner={editing}
          types={types}
          onAddType={addType}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); reload() }}
        />
      )}
    </div>
  )
}

'use client'

// Словарь терминов системы — справка для партнёров и сотрудников, кто не знает
// финансовых/маркетинговых терминов. Формат: русское название · английское ·
// расшифровка простым языком. Доступно всем ролям (справка, не данные компании).

import { useState, useMemo } from 'react'
import { SettingsSubpageHeader } from '@/components/settings/BackToSettings'
import { GLOSSARY, GLOSSARY_GROUPS, type GlossaryGroup } from '@/lib/glossary'

export default function GlossaryPage() {
  const [q, setQ] = useState('')
  const [group, setGroup] = useState<GlossaryGroup | 'Все'>('Все')

  const found = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return GLOSSARY.filter(t => {
      if (group !== 'Все' && t.group !== group) return false
      if (!needle) return true
      return t.ru.toLowerCase().includes(needle)
        || t.en.toLowerCase().includes(needle)
        || t.desc.toLowerCase().includes(needle)
    })
  }, [q, group])

  const tabs: (GlossaryGroup | 'Все')[] = ['Все', ...GLOSSARY_GROUPS]

  return (
    <div className="flex flex-col gap-4 p-4 md:p-8">
      <SettingsSubpageHeader
        title="Словарь терминов"
        subtitle="Что значат термины системы — простыми словами"
      />

      <div style={{ fontFamily: "'Golos Text', system-ui, sans-serif", display: 'grid', gap: '16px', maxWidth: '980px' }}>

        {/* Поиск + группы */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '16px', padding: '16px 18px', display: 'grid', gap: '12px' }}>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Поиск термина — например «маржа», «CPI», «разрыв»…"
            style={{ width: '100%', padding: '11px 14px', border: '1px solid var(--line-strong)', borderRadius: '11px', fontSize: '14px', color: 'var(--ink)', boxSizing: 'border-box', fontFamily: 'inherit' }}
          />
          <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}>
            {tabs.map(g => {
              const on = g === group
              return (
                <button
                  key={g}
                  onClick={() => setGroup(g)}
                  style={{
                    background: on ? 'var(--accent-deep)' : 'var(--surface-2)', color: on ? 'var(--surface)' : 'var(--ink-2)',
                    border: `1px solid ${on ? 'var(--accent-deep)' : 'var(--line)'}`, borderRadius: '999px',
                    padding: '6px 14px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >{g}</button>
              )
            })}
          </div>
        </div>

        {/* Термины */}
        {found.length === 0 ? (
          <div style={{ background: 'var(--surface)', border: '1px dashed var(--line-strong)', borderRadius: '16px', padding: '40px', textAlign: 'center', fontSize: '13px', color: 'var(--ink-3)' }}>
            Ничего не нашлось по запросу «{q}»
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '10px' }}>
            {found.map(t => (
              <div key={t.ru} style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '14px', padding: '16px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>{t.ru}</span>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--info)', background: 'var(--info-soft)', borderRadius: '6px', padding: '2px 8px' }}>{t.en}</span>
                  <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--ink-3)', fontWeight: 600 }}>{t.group}</span>
                </div>
                <p style={{ fontSize: '13.5px', color: 'var(--ink-2)', margin: '8px 0 0', lineHeight: 1.5 }}>{t.desc}</p>
              </div>
            ))}
          </div>
        )}

        <div style={{ fontSize: '12px', color: 'var(--ink-3)', paddingLeft: '4px' }}>
          Всего терминов: {GLOSSARY.length}. Не нашли нужный — скажите, добавим.
        </div>
      </div>
    </div>
  )
}

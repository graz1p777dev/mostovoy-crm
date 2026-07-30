'use client'

import { useState, useTransition, useEffect } from 'react'
import { toast } from 'sonner'
import { X, Target, ChevronLeft, ChevronRight, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { upsertEmployeeKpi, getEmployeeKpiPlan, type KpiPlanFormData } from '@/actions/employees'
import { getKpiConfig, hasKpi, type KpiFieldConfig } from '@/lib/config/kpi-roles'

// ─── Константы ────────────────────────────────────────────────────────────────

const MONTHS = [
  'Январь','Февраль','Март','Апрель','Май','Июнь',
  'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь',
]

type FormState = Partial<Record<keyof KpiPlanFormData, string>>

function toNum(s: string | undefined): number | null {
  if (!s || s.trim() === '') return null
  const n = parseFloat(s)
  return isNaN(n) ? null : n
}

function buildEmptyForm(): FormState {
  return {
    plan_fv:        '',
    plan_sales:     '',
    plan_revenue:   '',
    plan_appeals:   '',
    plan_leads:     '',
    plan_nv:        '',
    plan_work_days: '',
  }
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  employeeId:   string
  employeeName: string
  role:         string
  initialYear:  number
  initialMonth: number  // 0-indexed (JS Date)
  onClose:      () => void
  onSaved:      () => void
}

// ─── Компонент ────────────────────────────────────────────────────────────────

export default function KpiPlansModal({
  employeeId, employeeName, role, initialYear, initialMonth, onClose, onSaved,
}: Props) {
  const [year,  setYear]  = useState(initialYear)
  const [month, setMonth] = useState(initialMonth)
  const [form,  setForm]  = useState<FormState>(buildEmptyForm())
  const [loading, setLoading] = useState(true)
  const [isPending, startTransition] = useTransition()

  const config = getKpiConfig(role)

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) } else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) } else setMonth(m => m + 1)
  }

  // Загружаем текущие планы при смене периода
  useEffect(() => {
    let cancelled = false
    getEmployeeKpiPlan(employeeId, year, month + 1).then(data => {
      if (cancelled) return
      setLoading(false)
      const next = buildEmptyForm()
      if (data) {
        const keys = Object.keys(next) as (keyof KpiPlanFormData)[]
        keys.forEach(k => {
          const v = data[k]
          if (v != null) next[k] = String(v)
        })
      }
      setForm(next)
    })
    return () => { cancelled = true }
  }, [employeeId, year, month])

  const set = (key: keyof KpiPlanFormData, value: string) =>
    setForm(f => ({ ...f, [key]: value }))

  const handleSave = () => {
    const payload: KpiPlanFormData = {
      plan_fv:        toNum(form.plan_fv),
      plan_sales:     toNum(form.plan_sales),
      plan_revenue:   toNum(form.plan_revenue),
      plan_appeals:   toNum(form.plan_appeals),
      plan_leads:     toNum(form.plan_leads),
      plan_nv:        toNum(form.plan_nv),
      plan_work_days: toNum(form.plan_work_days),
    }

    startTransition(async () => {
      const result = await upsertEmployeeKpi(employeeId, year, month + 1, payload)
      if (result.success) {
        toast.success('KPI-планы сохранены')
        onSaved()
      } else {
        toast.error(result.error)
      }
    })
  }

  // Роль без конфига KPI
  if (!hasKpi(role) || !config) {
    return (
      <ModalShell employeeName={employeeName} onClose={onClose}>
        <div className="p-8 text-center" style={{ color: '#7d7174' }}>
          <Target size={40} className="mx-auto mb-3 opacity-30" />
          <div className="font-medium mb-1" style={{ color: '#1b1517' }}>KPI не настроен</div>
          <div className="text-sm">Для роли «{role}» KPI-планы не предусмотрены.</div>
        </div>
      </ModalShell>
    )
  }

  const inp = 'h-9 rounded-lg border-gray-200 text-sm focus-visible:ring-1'

  return (
    <ModalShell
      employeeName={employeeName}
      subtitle={config.label}
      year={year}
      month={month}
      onPrev={prevMonth}
      onNext={nextMonth}
      onClose={onClose}
    >
      <div className="overflow-y-auto p-5">
        {loading ? (
          <div className="space-y-3">
            {[...Array(config.fields.length)].map((_, i) => (
              <div key={i} className="animate-pulse rounded-lg" style={{ height: 58, backgroundColor: '#fdfbfb' }} />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#7d7174' }}>
              Планы на {MONTHS[month]} {year}
            </p>

            <div className="grid grid-cols-2 gap-3">
              {config.fields.map(field => (
                <KpiField
                  key={field.key}
                  field={field}
                  value={form[field.key] ?? ''}
                  onChange={v => set(field.key, v)}
                  inputClass={inp}
                />
              ))}
            </div>

            <div
              className="flex items-start gap-2 p-3 rounded-xl text-xs"
              style={{ backgroundColor: '#fdfbfb', color: '#7d7174' }}
            >
              <Info size={13} className="shrink-0 mt-0.5" />
              <span>
                После сохранения KPI% пересчитается автоматически и обновится в таблице без перезагрузки страницы.
              </span>
            </div>
          </div>
        )}
      </div>

      <div
        className="shrink-0 flex items-center justify-end gap-2 px-5 py-4"
        style={{ borderTop: '1px solid #ebebee' }}
      >
        <Button variant="ghost" onClick={onClose} className="rounded-xl" disabled={isPending}>
          Отмена
        </Button>
        <Button
          onClick={handleSave}
          disabled={isPending || loading}
          className="rounded-xl text-white font-medium"
          style={{ backgroundColor: '#e11d1d' }}
        >
          {isPending ? 'Сохранение...' : 'Сохранить планы'}
        </Button>
      </div>
    </ModalShell>
  )
}

// ─── KpiField — один ряд формы ────────────────────────────────────────────────

function KpiField({
  field, value, onChange, inputClass,
}: {
  field: KpiFieldConfig
  value: string
  onChange: (v: string) => void
  inputClass: string
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-semibold text-gray-500">
        {field.label}
        {field.weight != null && (
          <span className="ml-1 text-[10px] font-normal" style={{ color: '#7d7174' }}>
            (вес {field.weight}%)
          </span>
        )}
      </Label>
      <Input
        type="number"
        min="0"
        step={field.type === 'decimal' ? '0.1' : '1'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={field.placeholder}
        className={inputClass}
      />
      {field.description && (
        <p className="text-[10px]" style={{ color: '#7d7174' }}>{field.description}</p>
      )}
    </div>
  )
}

// ─── ModalShell — общая обёртка ───────────────────────────────────────────────

function ModalShell({
  employeeName,
  subtitle,
  year,
  month,
  onPrev,
  onNext,
  onClose,
  children,
}: {
  employeeName: string
  subtitle?: string
  year?: number
  month?: number
  onPrev?: () => void
  onNext?: () => void
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(28,23,25,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="relative w-full max-w-lg mx-4 rounded-2xl overflow-hidden flex flex-col"
        style={{ backgroundColor: '#ffffff', maxHeight: '90vh' }}
      >
        {/* Шапка */}
        <div
          className="flex items-center gap-3 px-5 py-4 shrink-0"
          style={{ background: 'linear-gradient(135deg, #ff5c68 0%, #e11d1d 100%)' }}
        >
          <div
            className="flex items-center justify-center w-10 h-10 rounded-xl shrink-0"
            style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
          >
            <Target size={18} color="#ffffff" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-white text-sm leading-tight">KPI-планы</h2>
            <p className="text-[11px] truncate" style={{ color: 'rgba(255,255,255,0.6)' }}>
              {employeeName}
              {subtitle && ` · ${subtitle}`}
            </p>
          </div>
          <button onClick={onClose} className="ml-2 p-1.5 rounded-lg" style={{ color: 'rgba(255,255,255,0.7)' }}>
            <X size={16} />
          </button>
        </div>

        {/* Навигатор периода */}
        {year != null && month != null && onPrev && onNext && (
          <div
            className="flex items-center justify-between px-5 py-2.5 shrink-0"
            style={{ borderBottom: '1px solid #ebebee', backgroundColor: '#fdfbfb' }}
          >
            <button
              onClick={onPrev}
              className="flex items-center justify-center w-7 h-7 rounded-lg"
              style={{ backgroundColor: '#e11d1d' }}
            >
              <ChevronLeft size={14} color="#ffffff" />
            </button>
            <div className="font-semibold text-sm" style={{ color: '#1b1517' }}>
              {MONTHS[month]} {year}
            </div>
            <button
              onClick={onNext}
              className="flex items-center justify-center w-7 h-7 rounded-lg"
              style={{ backgroundColor: '#e11d1d' }}
            >
              <ChevronRight size={14} color="#ffffff" />
            </button>
          </div>
        )}

        {children}
      </div>
    </div>
  )
}

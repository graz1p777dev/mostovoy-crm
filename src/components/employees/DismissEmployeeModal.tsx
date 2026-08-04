'use client'

// Увольнение с указанием причины. Отдельная модалка вместо window.confirm:
// причина — кадровые данные, которые потом видно в досье уволенного, и вводить
// её через prompt() неудобно. Причина необязательна — не блокируем действие.

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { UserMinus } from 'lucide-react'

const SUGGESTIONS = [
  'По собственному желанию',
  'Соглашение сторон',
  'Не прошёл испытательный срок',
  'Нарушение дисциплины',
] as const

export function DismissEmployeeModal({ employeeName, isPending, onConfirm, onClose }: {
  employeeName: string
  isPending: boolean
  onConfirm: (reason: string) => void
  onClose: () => void
}) {
  const [reason, setReason] = useState('')

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(27,21,23,0.45)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget && !isPending) onClose() }}
    >
      <div
        className="relative w-full max-w-md mx-4 rounded-2xl overflow-hidden flex flex-col"
        style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--line)', maxHeight: '90vh' }}
        role="dialog"
        aria-modal="true"
        aria-label={`Увольнение сотрудника ${employeeName}`}
      >
        <div
          className="flex items-center gap-3 px-6 py-4 shrink-0"
          style={{ backgroundColor: 'var(--surface-2)', borderBottom: '1px solid var(--line)' }}
        >
          <div
            className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: 'var(--brand-soft)' }}
          >
            <UserMinus size={18} style={{ color: 'var(--brand-ink)' }} />
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold text-base" style={{ color: 'var(--ink)' }}>Увольнение сотрудника</h2>
            <p className="text-xs truncate" style={{ color: 'var(--ink-3)' }}>{employeeName}</p>
          </div>
        </div>

        <div className="px-6 py-5 space-y-3">
          <p className="text-[12.5px]" style={{ color: 'var(--ink-2)' }}>
            Сотрудник переедет в архив и потеряет доступ к системе. Его данные и история сохранятся —
            при необходимости увольнение можно отменить кнопкой «Восстановить».
          </p>

          <div className="space-y-1">
            <Label className="text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>
              Причина увольнения <span style={{ color: 'var(--ink-4)' }}>· необязательно</span>
            </Label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              autoFocus
              placeholder="Например: по собственному желанию"
              // Фокус-рамка задана явно фирменным красным: дефолтное кольцо темы —
              // фиолетовое, а violet/purple в палитре МОСТОВОГО запрещены.
              className="w-full min-w-0 rounded-xl border px-3 py-2 text-[12.5px] resize-none focus:outline-none"
              style={{ color: 'var(--ink)', borderColor: 'var(--line)', background: 'var(--surface-2)' }}
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--brand)' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--line)' }}
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setReason(s)}
                disabled={isPending}
                className="px-2.5 py-1 rounded-xl text-[11px] font-medium transition-colors disabled:opacity-50"
                style={{ backgroundColor: 'var(--surface-2)', border: '1px solid var(--line)', color: 'var(--ink-2)' }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div
          className="flex items-center justify-end gap-2 px-6 py-4 shrink-0"
          style={{ borderTop: '1px solid var(--line)' }}
        >
          <Button variant="ghost" size="sm" className="rounded-xl" onClick={onClose} disabled={isPending}>
            Отмена
          </Button>
          <Button
            size="sm"
            className="rounded-xl text-white"
            // Белый текст только на --accent-deep: на светлом конце градиента
            // (var(--accent-to)) контраст падает до 2.84:1.
            style={{ backgroundColor: 'var(--accent-deep)' }}
            onClick={() => onConfirm(reason)}
            disabled={isPending}
          >
            <UserMinus size={14} className="mr-1.5" />
            {isPending ? 'Увольнение…' : 'Уволить'}
          </Button>
        </div>
      </div>
    </div>
  )
}

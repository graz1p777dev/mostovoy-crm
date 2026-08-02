'use client'
import { useEffect } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  onClose: () => void
  children: React.ReactNode
  variant?: 'center' | 'right'
}

export default function Modal({ onClose, children, variant = 'center' }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', handler)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return createPortal(
    <div
      className={`fixed inset-0 z-[9999] flex bg-black/45 backdrop-blur-sm animate-fade-in ${variant === 'right' ? 'items-stretch justify-end' : 'items-center justify-center'}`}
      onClick={onClose}
    >
      <div className={variant === 'right' ? 'h-full' : ''} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.body
  )
}

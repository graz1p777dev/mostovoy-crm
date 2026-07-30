'use client'
import { useEffect } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  onClose: () => void
  children: React.ReactNode
}

export default function Modal({ onClose, children }: Props) {
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
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.body
  )
}

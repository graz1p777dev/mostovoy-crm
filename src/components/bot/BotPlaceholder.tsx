import { ReactNode } from 'react'

export default function BotPlaceholder({ icon, title, subtitle, note }: {
  icon: ReactNode
  title: string
  subtitle: string
  note?: string
}) {
  return (
    <div className="p-8">
      <div
        className="rounded-2xl px-8 py-14 flex flex-col items-center justify-center text-center"
        style={{ backgroundColor: '#ffffff' }}
      >
        <div
          className="flex items-center justify-center rounded-2xl mb-5"
          style={{ width: 56, height: 56, backgroundColor: '#e11d1d' }}
        >
          {icon}
        </div>
        <h1 className="text-xl font-bold" style={{ color: '#1b1517' }}>{title}</h1>
        <p className="text-sm mt-1.5 max-w-md" style={{ color: '#6b6063' }}>{subtitle}</p>
        {note && (
          <p className="text-xs mt-5 px-4 py-2 rounded-lg"
             style={{ backgroundColor: '#fdfbfb', color: '#e11d1d' }}>
            {note}
          </p>
        )}
      </div>
    </div>
  )
}

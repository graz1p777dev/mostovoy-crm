export function SectionCard({ icon, title, children }: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl overflow-hidden glass">
      <div
        className="flex items-center gap-2.5 px-5 py-4"
        style={{ borderBottom: '1px solid rgba(28,20,22,0.07)' }}
      >
        <div className="flex items-center justify-center w-8 h-8 rounded-xl brand-gradient">
          {icon}
        </div>
        <h2 className="font-semibold text-sm text-foreground">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

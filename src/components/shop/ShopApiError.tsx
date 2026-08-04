import { AlertTriangle } from 'lucide-react'

/** Витрина недоступна или интеграция не настроена — показываем её текст ошибки. */
export function ShopApiError({ error }: { error: string }) {
  return (
    <div className="p-4 md:p-8">
      <div className="flex max-w-xl items-start gap-3 rounded-2xl bg-white p-5">
        <AlertTriangle size={18} className="mt-0.5 flex-shrink-0 text-destructive" />
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
            Нет связи с витриной «МОСТОВОЙ»
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Раздел работает через админ-API магазина: нужны MOSTOVOY_API_URL и MOSTOVOY_ADMIN_TOKEN,
            и сам сервер витрины должен быть запущен.
          </p>
        </div>
      </div>
    </div>
  )
}

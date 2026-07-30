// Фирменный экран загрузки: вращающийся круглый логотип Мостового.
// Тот же приём, что на витрине магазина, — чтобы CRM и сайт выглядели одинаково.
export default function PageLoader({ minHeight = '60vh' }: { minHeight?: string }) {
  return (
    <div className="page-loader" style={{ minHeight }} role="status" aria-live="polite">
      <span className="page-loader__mark" aria-hidden />
      <span className="page-loader__name">МОСТОВОЙ</span>
      <span className="sr-only">Загрузка</span>
    </div>
  )
}

import PageLoader from '@/components/common/PageLoader'

// Экран загрузки для всего, что вне /dashboard: вход, восстановление пароля и т.д.
export default function RootLoading() {
  return <PageLoader minHeight="100vh" />
}

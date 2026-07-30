import { Suspense } from 'react'
import { getNotifications } from '@/actions/notifications'
import NotificationsList from '@/components/notifications/NotificationsList'

export const dynamic = 'force-dynamic'

async function NotificationsData({ filter }: { filter: 'all' | 'important' }) {
  const notifications = await getNotifications(filter)
  return <NotificationsList key={filter} initialItems={notifications} initialFilter={filter} />
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>
}) {
  const { filter: rawFilter } = await searchParams
  const filter = rawFilter === 'important' ? 'important' : 'all'

  return (
    <div className="max-w-3xl mx-auto py-6 px-4">
      <Suspense fallback={<div style={{ color: '#7d7174', fontSize: 13 }}>Загрузка…</div>}>
        <NotificationsData filter={filter} />
      </Suspense>
    </div>
  )
}

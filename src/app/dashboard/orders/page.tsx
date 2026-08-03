import { getOrdersData } from '@/actions/deals'
import OrdersList from '@/components/orders/OrdersList'

export const dynamic = 'force-dynamic'

export default async function OrdersPage() {
  const { stages, deals, employees, me } = await getOrdersData()

  if (!me) {
    return <div className="p-8 text-sm text-gray-400">Нет доступа</div>
  }

  return (
    <OrdersList
      initialOrders={deals}
      stages={stages}
      employees={employees}
      me={me}
    />
  )
}

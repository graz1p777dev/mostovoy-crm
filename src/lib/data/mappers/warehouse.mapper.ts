// ─── WarehouseMapper ──────────────────────────────────────────────────────────

import type { WarehouseRaw } from '../contracts/IWarehouseAdapter'
import type { WarehouseData } from '@/lib/models/warehouse'

export const WarehouseMapper = {
  map(raw: WarehouseRaw): WarehouseData {
    const products = raw.products.map(p => {
      const margin    = p.revenue - p.cost_price * p.sold
      const marginPct = p.revenue === 0 ? 0 : Math.round((margin / p.revenue) * 100)
      return {
        id: p.id, name: p.name, sku: p.sku,
        stock: p.stock, sold: p.sold,
        revenue: p.revenue, costPrice: p.cost_price,
        margin, marginPct,
      }
    })

    const totalRevenue = products.reduce((s, p) => s + p.revenue,   0)
    const totalCost    = products.reduce((s, p) => s + p.costPrice * p.sold, 0)
    const totalMargin  = totalRevenue - totalCost
    const totalSold    = products.reduce((s, p) => s + p.sold,      0)

    return {
      kpi: {
        totalRevenue, totalCost, totalMargin, totalSold,
        marginPct:     totalRevenue === 0 ? 0 : Math.round((totalMargin / totalRevenue) * 100),
        lowStockCount: products.filter(p => p.stock < 5).length,
      },
      products,
      movements: [],
    }
  },
}

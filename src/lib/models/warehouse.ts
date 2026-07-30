// ─── Model: Товароучёт ────────────────────────────────────────────────────────

import type { MoneyKGS, ISODateString } from './common'

export interface ProductRow {
  id:         string
  name:       string
  sku:        string
  stock:      number
  sold:       number
  revenue:    MoneyKGS
  costPrice:  MoneyKGS
  margin:     MoneyKGS
  marginPct:  number
}

export interface WarehouseKpiData {
  totalRevenue:  MoneyKGS
  totalCost:     MoneyKGS
  totalMargin:   MoneyKGS
  marginPct:     number
  totalSold:     number
  lowStockCount: number      // товары с остатком < 5
}

export interface StockMovementRow {
  date:      ISODateString
  product:   string
  qty:       number
  direction: 'in' | 'out'
  reason:    string
}

export interface WarehouseData {
  kpi:       WarehouseKpiData
  products:  ProductRow[]
  movements: StockMovementRow[]
}

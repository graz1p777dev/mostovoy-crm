// ─── Contract: IWarehouseAdapter ──────────────────────────────────────────────
// Реализации: MockWarehouseAdapter → SupabaseWarehouseAdapter → ExternalWarehouseAdapter

export interface ProductRaw {
  id:         string
  name:       string
  sku:        string
  stock:      number
  sold:       number
  revenue:    number
  cost_price: number
}

export interface WarehouseDayRaw {
  date:    string
  salesFV: number
  revFV:   number
  salesNV: number
  revNV:   number
  costFV:  number
  costNV:  number
}

export interface WarehouseRaw {
  year:     number
  month:    number
  daily:    WarehouseDayRaw[]
  products: ProductRaw[]
}

export interface IWarehouseAdapter {
  fetchData(year: number, month: number): Promise<WarehouseRaw>
}

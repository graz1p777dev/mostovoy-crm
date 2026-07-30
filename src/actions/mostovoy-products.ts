'use server'

// Товары витрины «МОСТОВОЙ». Всё общение с её админ-API идёт только отсюда:
// x-admin-token добавляется на сервере и в браузер не попадает.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { mostovoyFetch } from '@/lib/mostovoy-api'
import {
  SHOP_CURRENCIES,
  type ShopPriceChange,
  type ShopProduct,
  type ShopProductsData,
} from '@/lib/models/mostovoy'

export type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; error: string }

const PAGE = '/dashboard/products'

// ─── Чтение ──────────────────────────────────────────────────────────────────

export async function getShopProducts(): Promise<
  { ok: true; data: ShopProductsData } | { ok: false; error: string }
> {
  const result = await mostovoyFetch<ShopProductsData>('/products')
  if (!result.ok) return { ok: false, error: result.error }
  return {
    ok: true,
    data: {
      products: result.data.products ?? [],
      groups: result.data.groups ?? [],
      categorySuggestions: result.data.categorySuggestions ?? [],
    },
  }
}

/** История цен витрины (price_history) — для блока «что подорожало» на дашборде. */
export async function getShopPriceHistory(
  limit = 20
): Promise<{ ok: true; changes: ShopPriceChange[] } | { ok: false; error: string }> {
  const result = await mostovoyFetch<{ changes: ShopPriceChange[] }>(
    `/price-history?limit=${Math.min(500, Math.max(1, Math.trunc(limit)))}`
  )
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, changes: result.data.changes ?? [] }
}

// ─── Схема формы ─────────────────────────────────────────────────────────────
// Витрина валидирует всё сама и отвечает готовыми русскими сообщениями —
// здесь только то, что можно проверить не ходя по сети (пустое название,
// нечисловая цена), чтобы не гонять заведомо неверный запрос.

const SwatchSchema = z.tuple([z.string().trim().min(1), z.string().trim()])

const ProductSchema = z.object({
  name: z.string().trim().min(1, 'Название обязательно').max(200, 'Название длиннее 200 символов'),
  price: z.coerce.number().positive('Цена должна быть положительным числом'),
  currency: z.enum(SHOP_CURRENCIES),
  brand: z.string().trim().optional(),
  category: z.string().trim().optional(),
  productGroup: z.string().trim().optional(),
  color: z.string().trim().optional(),
  variant: z.string().trim().optional(),
  description: z.string().trim().optional(),
  storageOptions: z.string().optional(),
  image: z.string().trim().optional(),
  images: z.string().optional(),
  swatches: z.array(SwatchSchema).optional(),
  discountPercent: z.string().trim().optional(),
  available: z.boolean().optional(),
})

export type ShopProductPayload = z.input<typeof ProductSchema>

/** Тело для витрины: пустые строки превращаем в null, списки — в массивы. */
function toApiBody(input: z.output<typeof ProductSchema>) {
  return {
    name: input.name,
    price: input.price,
    currency: input.currency,
    brand: input.brand || null,
    category: input.category || null,
    productGroup: input.productGroup || null,
    color: input.color || null,
    variant: input.variant || null,
    description: input.description || null,
    storageOptions: splitList(input.storageOptions),
    image: input.image || null,
    images: splitList(input.images),
    swatches: (input.swatches ?? []).map(([name, hex]) => ({ name, hex })),
    discountPercent: input.discountPercent || null,
    available: input.available !== false,
  }
}

function splitList(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Ошибка валидации'
}

// ─── Мутации ─────────────────────────────────────────────────────────────────

export interface SavedProduct {
  slug: string
  /** Предупреждения витрины: например, пропущенное недоступное доп. фото. */
  warnings: string[]
}

export async function createShopProduct(
  input: ShopProductPayload
): Promise<ActionResult<SavedProduct>> {
  const parsed = ProductSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: firstIssue(parsed.error) }

  const result = await mostovoyFetch<{ product: ShopProduct; warnings?: string[] }>('/products', {
    method: 'POST',
    body: toApiBody(parsed.data),
  })
  if (!result.ok) return { success: false, error: result.error }

  revalidatePath(PAGE)
  return { success: true, data: { slug: result.data.product.slug, warnings: result.data.warnings ?? [] } }
}

export async function updateShopProduct(
  slug: string,
  input: ShopProductPayload
): Promise<ActionResult<SavedProduct>> {
  const parsed = ProductSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: firstIssue(parsed.error) }

  const result = await mostovoyFetch<{ product: ShopProduct; warnings?: string[] }>(
    `/products/${encodeURIComponent(slug)}`,
    { method: 'PUT', body: toApiBody(parsed.data) }
  )
  if (!result.ok) return { success: false, error: result.error }

  revalidatePath(PAGE)
  return { success: true, data: { slug: result.data.product.slug, warnings: result.data.warnings ?? [] } }
}

/** Мягкое удаление: товар уходит с витрины (status = hidden), но остаётся в базе. */
export async function hideShopProduct(slug: string): Promise<ActionResult> {
  const result = await mostovoyFetch(`/products/${encodeURIComponent(slug)}`, { method: 'DELETE' })
  if (!result.ok) return { success: false, error: result.error }
  revalidatePath(PAGE)
  return { success: true }
}

export async function restoreShopProduct(slug: string): Promise<ActionResult> {
  const result = await mostovoyFetch(`/products/${encodeURIComponent(slug)}/restore`, { method: 'POST' })
  if (!result.ok) return { success: false, error: result.error }
  revalidatePath(PAGE)
  return { success: true }
}

/** Безвозвратное удаление из базы витрины. Отменить нельзя. */
export async function deleteShopProductPermanently(slug: string): Promise<ActionResult> {
  const result = await mostovoyFetch(`/products/${encodeURIComponent(slug)}/permanent`, {
    method: 'DELETE',
  })
  if (!result.ok) return { success: false, error: result.error }
  revalidatePath(PAGE)
  return { success: true }
}

// ─── Загрузка фото ───────────────────────────────────────────────────────────
// Файл идёт через сервер CRM: витрина требует админ-токен, а он не должен
// оказаться в браузере. Ответ — путь вида /uploads/xxx.webp на домене витрины.

export async function uploadShopImage(formData: FormData): Promise<ActionResult<{ url: string }>> {
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: 'Файл не выбран' }
  }

  const forward = new FormData()
  forward.append('file', file, file.name)
  const result = await mostovoyFetch<{ url: string }>('/upload', { method: 'POST', formData: forward })
  if (!result.ok) return { success: false, error: result.error }
  return { success: true, data: { url: result.data.url } }
}

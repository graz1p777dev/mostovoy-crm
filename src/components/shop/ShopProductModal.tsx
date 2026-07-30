'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { createShopProduct, updateShopProduct } from '@/actions/mostovoy-products'
import { SHOP_CURRENCIES, type ShopCurrency, type ShopProduct, type ShopSwatch } from '@/lib/models/mostovoy'
import { ShopImageField } from './ShopImageField'

interface FormState {
  name: string
  price: string
  currency: ShopCurrency
  brand: string
  category: string
  productGroup: string
  color: string
  variant: string
  description: string
  storageOptions: string
  image: string
  images: string
  swatches: ShopSwatch[]
  discountPercent: string
  available: boolean
}

const EMPTY: FormState = {
  name: '', price: '', currency: 'USD', brand: '', category: '', productGroup: '',
  color: '', variant: '', description: '', storageOptions: '', image: '', images: '',
  swatches: [], discountPercent: '', available: true,
}

function fromProduct(product: ShopProduct): FormState {
  return {
    name: product.name ?? '',
    price: product.price != null ? String(product.price) : '',
    currency: (SHOP_CURRENCIES as readonly string[]).includes(product.currency)
      ? (product.currency as ShopCurrency)
      : 'USD',
    brand: product.brand ?? '',
    category: product.category ?? '',
    productGroup: product.group ?? '',
    color: product.color ?? '',
    variant: product.variant ?? '',
    description: product.description ?? '',
    storageOptions: (product.storageOptions ?? []).join(', '),
    image: product.image ?? '',
    images: (product.images ?? []).join('\n'),
    swatches: product.swatches ?? [],
    discountPercent: product.discountPercent != null ? String(product.discountPercent) : '',
    available: product.available,
  }
}

interface Props {
  /** null — создание нового товара. */
  product: ShopProduct | null
  onClose: () => void
  groups: string[]
  categorySuggestions: string[]
  imageBase: string
}

/**
 * Диалог монтируется только на время открытия (родитель ставит key по слагу),
 * поэтому начальное состояние берётся прямо из товара — без useEffect-синка.
 */
export function ShopProductModal({
  product, onClose, groups, categorySuggestions, imageBase,
}: Props) {
  const [form, setForm] = useState<FormState>(() => (product ? fromProduct(product) : EMPTY))
  const [saving, startSaving] = useTransition()

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    startSaving(async () => {
      const payload = { ...form }
      const result = product
        ? await updateShopProduct(product.slug, payload)
        : await createShopProduct(payload)

      if (!result.success) {
        // Тексты валидации приходят с витрины на русском — показываем как есть.
        toast.error(result.error)
        return
      }
      for (const warning of result.data?.warnings ?? []) toast.warning(warning)
      toast.success(product ? 'Товар обновлён' : 'Товар добавлен')
      onClose()
    })
  }

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{product ? 'Товар витрины' : 'Новый товар'}</DialogTitle>
          <DialogDescription>
            {product
              ? `Слаг ${product.slug} · источник ${product.origin === 'telegram' ? 'Telegram' : 'вручную'}`
              : 'Товар появится в каталоге витрины сразу после сохранения.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Название" className="sm:col-span-2">
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} className="h-9" />
            </Field>

            <Field label="Цена">
              <Input
                value={form.price}
                onChange={(e) => set('price', e.target.value)}
                inputMode="decimal"
                placeholder="650"
                className="h-9"
              />
            </Field>

            <Field label="Валюта">
              <Select value={form.currency} onValueChange={(v) => set('currency', (v as ShopCurrency) ?? 'USD')}>
                <SelectTrigger className="h-9 w-full">
                  <SelectValue>{form.currency}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {SHOP_CURRENCIES.map((currency) => (
                    <SelectItem key={currency} value={currency}>{currency}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Бренд">
              <Input value={form.brand} onChange={(e) => set('brand', e.target.value)} className="h-9" />
            </Field>

            <Field label="Категория">
              <Input
                value={form.category}
                onChange={(e) => set('category', e.target.value)}
                list="shop-category-suggestions"
                className="h-9"
              />
              <datalist id="shop-category-suggestions">
                {categorySuggestions.map((item) => <option key={item} value={item} />)}
              </datalist>
            </Field>

            <Field label="Группа">
              <Select value={form.productGroup} onValueChange={(v) => set('productGroup', v ?? '')}>
                <SelectTrigger className="h-9 w-full">
                  <SelectValue>{form.productGroup || 'Определить автоматически'}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Определить автоматически</SelectItem>
                  {groups.map((group) => (
                    <SelectItem key={group} value={group}>{group}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Цвет">
              <Input value={form.color} onChange={(e) => set('color', e.target.value)} className="h-9" />
            </Field>

            <Field label="Вариант">
              <Input
                value={form.variant}
                onChange={(e) => set('variant', e.target.value)}
                placeholder="Pro / Max / Ultra"
                className="h-9"
              />
            </Field>

            <Field label="Память" hint="Через запятую: 128 ГБ, 256 ГБ">
              <Input
                value={form.storageOptions}
                onChange={(e) => set('storageOptions', e.target.value)}
                className="h-9"
              />
            </Field>

            <Field label="Скидка, %" hint="1–99 или пусто">
              <Input
                value={form.discountPercent}
                onChange={(e) => set('discountPercent', e.target.value)}
                inputMode="decimal"
                className="h-9"
              />
            </Field>

            <Field label="Описание" className="sm:col-span-2" hint="До 900 символов">
              <Textarea
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                rows={3}
              />
            </Field>
          </div>

          <ShopImageField
            label="Главное фото"
            value={form.image}
            onChange={(v) => set('image', v)}
            imageBase={imageBase}
          />

          <Field label="Доп. фото" hint="По одной ссылке в строке. Недоступные витрина пропустит и предупредит.">
            <Textarea value={form.images} onChange={(e) => set('images', e.target.value)} rows={2} />
          </Field>

          <SwatchesEditor value={form.swatches} onChange={(v) => set('swatches', v)} />

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.available}
              onChange={(e) => set('available', e.target.checked)}
              className="h-4 w-4 accent-[var(--accent-from)]"
            />
            В наличии
          </label>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              Отмена
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Сохранение…' : product ? 'Сохранить' : 'Добавить товар'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label, hint, className, children,
}: {
  label: string
  hint?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ''}`}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

/** Доступные цвета: пары «название + hex», до 12 — столько принимает витрина. */
function SwatchesEditor({
  value, onChange,
}: {
  value: ShopSwatch[]
  onChange: (value: ShopSwatch[]) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">Доступные цвета</Label>
      <div className="flex flex-col gap-2">
        {value.map(([name, hex], index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              value={name}
              onChange={(e) => {
                const next = [...value]
                next[index] = [e.target.value, hex]
                onChange(next)
              }}
              placeholder="Чёрный"
              className="h-9"
            />
            <input
              type="color"
              value={/^#([0-9a-f]{6})$/i.test(hex) ? hex : '#cccccc'}
              onChange={(e) => {
                const next = [...value]
                next[index] = [name, e.target.value]
                onChange(next)
              }}
              className="h-9 w-12 flex-shrink-0 cursor-pointer rounded-lg border border-border bg-transparent"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 flex-shrink-0"
              onClick={() => onChange(value.filter((_, i) => i !== index))}
            >
              <Trash2 size={14} />
            </Button>
          </div>
        ))}
      </div>
      {value.length < 12 && (
        <Button
          type="button"
          variant="ghost"
          className="h-8 self-start px-2 text-xs"
          onClick={() => onChange([...value, ['', '#cccccc']])}
        >
          <Plus size={13} className="mr-1" /> Добавить цвет
        </Button>
      )}
    </div>
  )
}

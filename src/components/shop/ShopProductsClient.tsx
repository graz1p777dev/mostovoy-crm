'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ChevronDown, ChevronUp, ChevronsUpDown, EyeOff, ImageOff, Package, Pencil,
  Plus, RotateCcw, Search, Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  deleteShopProductPermanently, hideShopProduct, restoreShopProduct,
} from '@/actions/mostovoy-products'
import type { ShopProduct, ShopProductsData } from '@/lib/models/mostovoy'
import { ShopProductModal } from './ShopProductModal'
import { absoluteShopImage } from './ShopImageField'

type SortKey = 'name' | 'price' | 'updatedAt'
type SortDir = 'asc' | 'desc'

const STATUS_LABELS: Record<string, string> = {
  active: 'В каталоге',
  needs_research: 'Нужно описание',
  hidden: 'Скрыт',
  sync_error: 'Ошибка синхронизации',
}

const STATUS_BADGE: Record<string, { bg: string; color: string }> = {
  active: { bg: '#dcfce7', color: '#15803d' },
  needs_research: { bg: '#fef9c3', color: '#854d0e' },
  hidden: { bg: '#fdfbfb', color: '#6b7280' },
  sync_error: { bg: '#fee2e2', color: '#c01818' },
}

function formatMoney(value: number, currency: string) {
  return `${value.toLocaleString('ru-RU')} ${currency}`
}

function formatDate(iso: string) {
  const date = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z')
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

interface Props {
  data: ShopProductsData
  imageBase: string
}

export function ShopProductsClient({ data, imageBase }: Props) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [group, setGroup] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('updatedAt')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<ShopProduct | null>(null)
  const [pending, startAction] = useTransition()

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('ru')
    const filtered = data.products.filter((product) => {
      if (status && product.status !== status) return false
      if (group && product.group !== group) return false
      if (!needle) return true
      return [product.name, product.brand, product.category, product.slug]
        .filter(Boolean)
        .some((field) => String(field).toLocaleLowerCase('ru').includes(needle))
    })

    const dir = sortDir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      if (sortKey === 'price') return (a.price - b.price) * dir
      if (sortKey === 'name') return a.name.localeCompare(b.name, 'ru') * dir
      return a.updatedAt.localeCompare(b.updatedAt) * dir
    })
  }, [data.products, query, status, group, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir(key === 'name' ? 'asc' : 'desc') }
  }

  function runAction(label: string, action: () => Promise<{ success: boolean; error?: string }>) {
    startAction(async () => {
      const result = await action()
      if (!result.success) {
        toast.error(result.error ?? 'Не удалось выполнить действие')
        return
      }
      toast.success(label)
      router.refresh()
    })
  }

  const counts = useMemo(() => ({
    total: data.products.length,
    active: data.products.filter((p) => p.status === 'active').length,
    hidden: data.products.filter((p) => p.status === 'hidden').length,
    unavailable: data.products.filter((p) => !p.available).length,
  }), [data.products])

  return (
    <div className="flex flex-col gap-4 p-4 md:p-8">
      {/* Сводка */}
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
        <SummaryTile label="Всего товаров" value={counts.total} />
        <SummaryTile label="В каталоге" value={counts.active} />
        <SummaryTile label="Скрыто" value={counts.hidden} />
        <SummaryTile label="Нет в наличии" value={counts.unavailable} />
      </div>

      {/* Фильтры */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по названию, бренду, категории, слагу"
            className="h-9 pl-9"
          />
        </div>

        <Select value={status} onValueChange={(v) => setStatus(v ?? '')}>
          <SelectTrigger className="h-9" style={{ minWidth: 160 }}>
            <SelectValue>{status ? (STATUS_LABELS[status] ?? status) : 'Все статусы'}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Все статусы</SelectItem>
            {Object.entries(STATUS_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={group} onValueChange={(v) => setGroup(v ?? '')}>
          <SelectTrigger className="h-9" style={{ minWidth: 150 }}>
            <SelectValue>{group || 'Все группы'}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Все группы</SelectItem>
            {data.groups.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
          </SelectContent>
        </Select>

        <Button onClick={() => { setEditing(null); setModalOpen(true) }}>
          <Plus size={14} className="mr-1.5" /> Новый товар
        </Button>
      </div>

      {/* Таблица */}
      <div className="overflow-x-auto rounded-2xl bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase" style={{ color: '#6b6063' }}>
              <th className="px-4 py-3 text-left font-medium">Товар</th>
              <SortableHead label="Название" col="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <th className="px-3 py-3 text-left font-medium">Группа</th>
              <SortableHead label="Цена" col="price" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
              <th className="px-3 py-3 text-left font-medium">Статус</th>
              <SortableHead label="Изменён" col="updatedAt" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <th className="px-4 py-3 text-right font-medium">Действия</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  {data.products.length === 0
                    ? 'В каталоге витрины пока нет товаров.'
                    : 'Ничего не найдено — измените фильтры.'}
                </td>
              </tr>
            )}
            {visible.map((product) => {
              const badge = STATUS_BADGE[product.status] ?? STATUS_BADGE.hidden
              const preview = product.image ? absoluteShopImage(product.image, imageBase) : ''
              return (
                <tr key={product.id} style={{ borderTop: '1px solid #fdfbfb' }}>
                  <td className="px-4 py-2.5">
                    <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-muted/40">
                      {preview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={preview} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <ImageOff size={13} className="text-muted-foreground" />
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <p className="font-medium" style={{ color: '#1b1517' }}>{product.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {[product.brand, product.category].filter(Boolean).join(' · ') || product.slug}
                      {!product.available && ' · нет в наличии'}
                    </p>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{product.group ?? '—'}</td>
                  <td className="px-3 py-2.5 text-right" style={{ color: '#1b1517' }}>
                    {formatMoney(product.price, product.currency)}
                    {product.salePrice != null && (
                      <span className="block text-[11px]" style={{ color: '#15803d' }}>
                        со скидкой {formatMoney(product.salePrice, product.currency)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className="inline-block rounded-full px-2 py-0.5 text-[11px] font-medium"
                      style={{ backgroundColor: badge.bg, color: badge.color }}
                    >
                      {STATUS_LABELS[product.status] ?? product.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{formatDate(product.updatedAt)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost" size="icon" className="h-8 w-8" title="Редактировать"
                        onClick={() => { setEditing(product); setModalOpen(true) }}
                      >
                        <Pencil size={14} />
                      </Button>
                      {product.status === 'hidden' ? (
                        <Button
                          variant="ghost" size="icon" className="h-8 w-8" title="Вернуть в каталог"
                          disabled={pending}
                          onClick={() => runAction('Товар вернулся в каталог', () => restoreShopProduct(product.slug))}
                        >
                          <RotateCcw size={14} />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost" size="icon" className="h-8 w-8" title="Скрыть с витрины"
                          disabled={pending}
                          onClick={() => runAction('Товар скрыт с витрины', () => hideShopProduct(product.slug))}
                        >
                          <EyeOff size={14} />
                        </Button>
                      )}
                      <Button
                        variant="ghost" size="icon" className="h-8 w-8" title="Удалить безвозвратно"
                        disabled={pending}
                        onClick={() => {
                          if (!window.confirm(`Удалить «${product.name}» из базы витрины безвозвратно?`)) return
                          runAction('Товар удалён', () => deleteShopProductPermanently(product.slug))
                        }}
                      >
                        <Trash2 size={14} className="text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Package size={12} />
        Каталог живёт на витрине: товары из Telegram-канала обновляются автосинхронизацией,
        правки отсюда применяются к тем же записям.
      </p>

      {/* key сбрасывает форму при переходе с одного товара на другой. */}
      {modalOpen && (
        <ShopProductModal
          key={editing?.slug ?? 'new'}
          product={editing}
          onClose={() => { setModalOpen(false); router.refresh() }}
          groups={data.groups}
          categorySuggestions={data.categorySuggestions}
          imageBase={imageBase}
        />
      )}
    </div>
  )
}

function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-white px-4 py-3.5">
      <div className="text-xl font-bold" style={{ color: '#1b1517' }}>{value.toLocaleString('ru-RU')}</div>
      <div className="mt-0.5 text-xs" style={{ color: '#6b6063' }}>{label}</div>
    </div>
  )
}

function SortableHead({
  label, col, sortKey, sortDir, onSort, align = 'left',
}: {
  label: string
  col: SortKey
  sortKey: SortKey
  sortDir: SortDir
  onSort: (key: SortKey) => void
  align?: 'left' | 'right'
}) {
  const active = sortKey === col
  const Icon = !active ? ChevronsUpDown : sortDir === 'asc' ? ChevronUp : ChevronDown
  return (
    <th className={`px-3 py-3 font-medium ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button
        type="button"
        onClick={() => onSort(col)}
        className={`inline-flex items-center gap-1 uppercase ${align === 'right' ? 'flex-row-reverse' : ''}`}
      >
        {label}
        <Icon size={12} style={{ color: active ? 'var(--accent-from)' : '#7d7174' }} />
      </button>
    </th>
  )
}

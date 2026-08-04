'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ImageOff, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { deleteShopPost } from '@/actions/mostovoy-posts'
import type { ShopPost } from '@/lib/models/mostovoy'
import { ShopPostModal } from './ShopPostModal'
import { absoluteShopImage } from './ShopImageField'

function formatDate(iso: string) {
  const date = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z')
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

interface Props {
  posts: ShopPost[]
  imageBase: string
}

export function ShopPostsClient({ posts, imageBase }: Props) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<ShopPost | null>(null)
  const [pending, startAction] = useTransition()

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('ru')
    return posts.filter((post) => {
      if (status && post.status !== status) return false
      if (!needle) return true
      return `${post.title} ${post.body}`.toLocaleLowerCase('ru').includes(needle)
    })
  }, [posts, query, status])

  function handleDelete(post: ShopPost) {
    if (!window.confirm(`Удалить пост «${post.title}»?`)) return
    startAction(async () => {
      const result = await deleteShopPost(post.slug)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success('Пост удалён')
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-8">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по заголовку и тексту"
            className="h-9 pl-9"
          />
        </div>

        <Select value={status} onValueChange={(v) => setStatus(v ?? '')}>
          <SelectTrigger className="h-9" style={{ minWidth: 160 }}>
            <SelectValue>
              {status === 'published' ? 'Опубликованные' : status === 'draft' ? 'Черновики' : 'Все посты'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Все посты</SelectItem>
            <SelectItem value="published">Опубликованные</SelectItem>
            <SelectItem value="draft">Черновики</SelectItem>
          </SelectContent>
        </Select>

        <Button onClick={() => { setEditing(null); setModalOpen(true) }}>
          <Plus size={14} className="mr-1.5" /> Новый пост
        </Button>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl bg-white px-4 py-12 text-center text-sm text-muted-foreground">
          {posts.length === 0 ? 'На витрине пока нет новостей.' : 'Ничего не найдено.'}
        </div>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
          {visible.map((post) => {
            const preview = post.image ? absoluteShopImage(post.image, imageBase) : ''
            return (
              <article key={post.id} className="flex flex-col gap-3 rounded-2xl bg-white p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted/40">
                    {preview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={preview} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <ImageOff size={14} className="text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold" style={{ color: 'var(--ink)' }}>{post.title}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {formatDate(post.publishedAt)}
                      {' · '}
                      <span style={{ color: post.status === 'published' ? 'var(--ok)' : 'var(--warn-strong-2)' }}>
                        {post.status === 'published' ? 'опубликован' : 'черновик'}
                      </span>
                    </p>
                  </div>
                </div>

                <p className="line-clamp-3 text-xs text-muted-foreground">{post.body}</p>

                <div className="flex justify-end gap-1 border-t border-border pt-2">
                  <Button
                    variant="ghost" size="icon" className="h-8 w-8" title="Редактировать"
                    onClick={() => { setEditing(post); setModalOpen(true) }}
                  >
                    <Pencil size={14} />
                  </Button>
                  <Button
                    variant="ghost" size="icon" className="h-8 w-8" title="Удалить"
                    disabled={pending}
                    onClick={() => handleDelete(post)}
                  >
                    <Trash2 size={14} className="text-destructive" />
                  </Button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {/* key сбрасывает форму при переходе с одного поста на другой. */}
      {modalOpen && (
        <ShopPostModal
          key={editing?.slug ?? 'new'}
          post={editing}
          onClose={() => { setModalOpen(false); router.refresh() }}
          imageBase={imageBase}
        />
      )}
    </div>
  )
}

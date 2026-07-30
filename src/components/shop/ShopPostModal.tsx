'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
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
import { createShopPost, updateShopPost } from '@/actions/mostovoy-posts'
import type { ShopPost } from '@/lib/models/mostovoy'
import { ShopImageField } from './ShopImageField'

type PostStatus = 'published' | 'draft'

interface FormState {
  title: string
  body: string
  image: string
  status: PostStatus
}

const EMPTY: FormState = { title: '', body: '', image: '', status: 'published' }

const STATUS_LABELS: Record<PostStatus, string> = {
  published: 'Опубликован',
  draft: 'Черновик',
}

interface Props {
  /** null — создание нового поста. */
  post: ShopPost | null
  onClose: () => void
  imageBase: string
}

/** Монтируется только на время открытия — начальное состояние берётся из поста. */
export function ShopPostModal({ post, onClose, imageBase }: Props) {
  const [form, setForm] = useState<FormState>(() =>
    post ? { title: post.title, body: post.body, image: post.image ?? '', status: post.status } : EMPTY
  )
  const [saving, startSaving] = useTransition()

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    startSaving(async () => {
      const result = post
        ? await updateShopPost(post.slug, form)
        : await createShopPost(form)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(post ? 'Пост обновлён' : 'Пост опубликован')
      onClose()
    })
  }

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{post ? 'Пост витрины' : 'Новый пост'}</DialogTitle>
          <DialogDescription>
            {post
              ? `Слаг ${post.slug}`
              : 'Опубликованные посты показываются в разделе новостей витрины.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Заголовок</Label>
            <Input value={form.title} onChange={(e) => set('title', e.target.value)} className="h-9" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Текст</Label>
            <Textarea value={form.body} onChange={(e) => set('body', e.target.value)} rows={7} />
            <p className="text-[11px] text-muted-foreground">До 5000 символов.</p>
          </div>

          <ShopImageField
            label="Фото"
            value={form.image}
            onChange={(v) => set('image', v)}
            imageBase={imageBase}
          />

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Статус</Label>
            <Select value={form.status} onValueChange={(v) => set('status', (v as PostStatus) ?? 'published')}>
              <SelectTrigger className="h-9 w-full">
                <SelectValue>{STATUS_LABELS[form.status]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="published">Опубликован</SelectItem>
                <SelectItem value="draft">Черновик</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              Отмена
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Сохранение…' : post ? 'Сохранить' : 'Создать пост'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

'use server'

// Новости витрины «МОСТОВОЙ» (раздел «Посты»). Как и товары — только через
// сервер: админ-токен витрины в браузер не уходит.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { mostovoyFetch } from '@/lib/mostovoy-api'
import type { ShopPost } from '@/lib/models/mostovoy'

export type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; error: string }

const PAGE = '/dashboard/posts'

export async function getShopPosts(): Promise<
  { ok: true; posts: ShopPost[] } | { ok: false; error: string }
> {
  const result = await mostovoyFetch<{ posts: ShopPost[] }>('/posts')
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, posts: result.data.posts ?? [] }
}

// Витрина проверяет всё сама (обязательные заголовок и текст, лимиты длины,
// доступность фото) — здесь только защита от заведомо пустой отправки.
const PostSchema = z.object({
  title: z.string().trim().min(1, 'Заголовок обязателен').max(200, 'Заголовок длиннее 200 символов'),
  body: z.string().trim().min(1, 'Текст новости обязателен').max(5000, 'Текст длиннее 5000 символов'),
  image: z.string().trim().optional(),
  status: z.enum(['published', 'draft']),
})

export type ShopPostPayload = z.input<typeof PostSchema>

export async function createShopPost(input: ShopPostPayload): Promise<ActionResult<{ slug: string }>> {
  const parsed = PostSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Ошибка валидации' }
  }

  const result = await mostovoyFetch<{ post: ShopPost }>('/posts', {
    method: 'POST',
    body: { ...parsed.data, image: parsed.data.image || null },
  })
  if (!result.ok) return { success: false, error: result.error }

  revalidatePath(PAGE)
  return { success: true, data: { slug: result.data.post.slug } }
}

export async function updateShopPost(
  slug: string,
  input: ShopPostPayload
): Promise<ActionResult<{ slug: string }>> {
  const parsed = PostSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Ошибка валидации' }
  }

  const result = await mostovoyFetch<{ post: ShopPost }>(`/posts/${encodeURIComponent(slug)}`, {
    method: 'PUT',
    // image обязателен в теле: витрина трактует undefined как «не менять»,
    // а пустую строку — как «убрать фото».
    body: { ...parsed.data, image: parsed.data.image || '' },
  })
  if (!result.ok) return { success: false, error: result.error }

  revalidatePath(PAGE)
  return { success: true, data: { slug: result.data.post.slug } }
}

export async function deleteShopPost(slug: string): Promise<ActionResult> {
  const result = await mostovoyFetch(`/posts/${encodeURIComponent(slug)}`, { method: 'DELETE' })
  if (!result.ok) return { success: false, error: result.error }
  revalidatePath(PAGE)
  return { success: true }
}

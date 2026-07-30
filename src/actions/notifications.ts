'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { Notification } from '@/types'

export type ActionResult = { success: true } | { success: false; error: string }

async function requireSession() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

export async function getNotifications(filter: 'all' | 'important' = 'all'): Promise<Notification[]> {
  const session = await requireSession()
  if (!session) return []

  const supabase = await createClient()
  let query = supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  if (filter === 'important') {
    query = query.eq('is_important', true)
  }

  const { data } = await query
  return (data ?? []) as Notification[]
}

export async function markNotificationRead(id: string): Promise<ActionResult> {
  const session = await requireSession()
  if (!session) return { success: false, error: 'Нет доступа' }

  const supabase = await createClient()
  const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id)
  if (error) return { success: false, error: error.message }

  revalidatePath('/dashboard/notifications')
  return { success: true }
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
  const session = await requireSession()
  if (!session) return { success: false, error: 'Нет доступа' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('is_read', false)
  if (error) return { success: false, error: error.message }

  revalidatePath('/dashboard/notifications')
  return { success: true }
}

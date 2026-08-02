'use server'

import { revalidatePath } from 'next/cache'
import { mostovoyFetch } from '@/lib/mostovoy-api'
import type { ShopBotApproval } from '@/lib/models/mostovoy'

const PAGE = '/dashboard/bot-approvals'

export async function getShopBotApprovals(status: 'pending' | 'approved' | 'rejected' | 'all' = 'pending') {
  return mostovoyFetch<{ approvals: ShopBotApproval[] }>(`/crm/approvals?status=${status}`)
}

export async function approveShopBotReply(formData: FormData) {
  const id = Number(formData.get('id'))
  const text = String(formData.get('text') || '').trim()
  if (!Number.isInteger(id) || id <= 0 || !text) return
  await mostovoyFetch(`/crm/approvals/${id}/approve`, { method: 'POST', body: { text } })
  revalidatePath(PAGE)
}

export async function rejectShopBotReply(formData: FormData) {
  const id = Number(formData.get('id'))
  const reason = String(formData.get('reason') || '').trim()
  if (!Number.isInteger(id) || id <= 0 || !reason) return
  await mostovoyFetch(`/crm/approvals/${id}/reject`, { method: 'POST', body: { reason } })
  revalidatePath(PAGE)
}

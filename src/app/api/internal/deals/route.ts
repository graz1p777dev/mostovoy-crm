// ─── POST /api/internal/deals ───────────────────────────────────────────────
// Витрина «МОСТОВОЙ» (Express + SQLite) зовёт этот эндпоинт, когда клиент
// впервые написал боту: в CRM появляется сделка в «Неразобранном».
// Защита — тот же общий секрет, что у /api/internal/notify: у витрины нет и
// не должно быть SUPABASE_SERVICE_ROLE_KEY.
//
// Вызов у витрины fire-and-forget: если CRM недоступна, бот всё равно
// ответит клиенту, а сделка подтянется кнопкой «Синхронизировать».

import { NextResponse } from 'next/server'
import { advanceDealToPrimaryContact, upsertDealFromInbound } from '@/lib/deals/auto-create'
import type { DealSource } from '@/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const VALID_SOURCES: readonly DealSource[] = [
  'telegram', 'whatsapp', 'instagram', 'manual', 'site',
]

export async function POST(request: Request) {
  const expectedToken = process.env.INTERNAL_NOTIFY_TOKEN
  if (!expectedToken) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  }
  if (request.headers.get('x-internal-token') !== expectedToken) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let payload: {
    externalKey?: string
    source?: string
    customerName?: string | null
    customerPhone?: string | null
    customerUsername?: string | null
  }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!payload.externalKey || !payload.externalKey.trim()) {
    return NextResponse.json({ error: 'externalKey is required' }, { status: 400 })
  }
  if (!payload.source || !VALID_SOURCES.includes(payload.source as DealSource)) {
    return NextResponse.json({ error: 'Invalid source' }, { status: 400 })
  }

  const result = await upsertDealFromInbound({
    externalKey: payload.externalKey,
    source: payload.source as DealSource,
    customerName: payload.customerName,
    customerPhone: payload.customerPhone,
    customerUsername: payload.customerUsername,
  })

  if (result.error) {
    console.error('internal/deals upsert failed', result.error)
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json({ ok: true, created: result.created, id: result.id })
}

export async function PATCH(request: Request) {
  const expectedToken = process.env.INTERNAL_NOTIFY_TOKEN
  if (!expectedToken) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  }
  if (request.headers.get('x-internal-token') !== expectedToken) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let payload: { externalKey?: string; action?: string }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!payload.externalKey?.trim()) {
    return NextResponse.json({ error: 'externalKey is required' }, { status: 400 })
  }
  if (payload.action !== 'primary_contact') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  const result = await advanceDealToPrimaryContact(payload.externalKey)
  if (result.error) {
    const status = result.error === 'Сделка не найдена' ? 404 : 500
    console.error('internal/deals advance failed', result.error)
    return NextResponse.json({ error: result.error }, { status })
  }
  return NextResponse.json({ ok: true, ...result })
}

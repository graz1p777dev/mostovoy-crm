import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { mostovoyFetch } from '@/lib/mostovoy-api'
import type { UserRole } from '@/types'

export const dynamic = 'force-dynamic'

type ShopEvent = {
  id: number
  conversationId: number | null
  level: string
  stage: string
  event: string
  message: string | null
  details: Record<string, unknown> | null
  createdAt: string | null
}

// Лаборатория руководителя должна показывать действия именно текущего бота
// магазина. Витрина хранит их в bot_events; токен остаётся только на сервере.
function isVisibleInFilter(event: ShopEvent, filter: string) {
  if (!filter) return true
  if (filter === 'amocrm') return event.stage === 'amocrm'
  if (filter === 'telegram') return event.stage === 'telegram'
  if (filter === 'openai') return ['ai', 'openai', 'catalog', 'hypervisor'].includes(event.stage)
  if (filter === 'pipeline') return ['pipeline', 'inbox', 'delivery', 'approval'].includes(event.stage)
  return true
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  const { data: employee } = await supabase
    .from('employees')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()

  const role = employee?.role as UserRole | undefined
  if (role !== 'owner' && role !== 'rop') {
    return NextResponse.json({ detail: 'Forbidden' }, { status: 403 })
  }

  const afterId = Number(request.nextUrl.searchParams.get('after_id') || 0)
  const limit = Math.min(150, Math.max(1, Number(request.nextUrl.searchParams.get('limit') || 80)))
  const filter = request.nextUrl.searchParams.get('action') || ''
  const result = await mostovoyFetch<{ events: ShopEvent[] }>('/crm/developer/events?limit=500')
  if (!result.ok) {
    return NextResponse.json({ detail: result.error }, { status: result.status })
  }

  const matching = result.data.events
    .filter((event) => event.id > afterId && isVisibleInFilter(event, filter))
    .sort((a, b) => a.id - b.id)

  const items = (afterId ? matching : matching.slice(-limit)).map((event) => ({
    id: event.id,
    created_at: event.createdAt,
    action: `${event.stage}.${event.event}`,
    status: event.level === 'error' ? 'error' : event.level === 'warn' ? 'skipped' : 'success',
    lead_id: event.conversationId,
    amocrm_lead_id: event.conversationId == null ? null : String(event.conversationId),
    client_name: null,
    error: event.level === 'error' ? event.message : null,
    detail: { ...(event.details || {}), message: event.message, stage: event.stage, event: event.event },
  }))

  return NextResponse.json({ items, last_id: items.at(-1)?.id ?? (afterId || null) })
}

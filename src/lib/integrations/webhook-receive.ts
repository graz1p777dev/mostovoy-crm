// ─── Общая логика приёма вебхуков Bitrix24 / amoCRM ────────────────────────
// Обе внешние системы не умеют слать кастомные заголовки авторизации на
// вебхуки, поэтому секрет — часть пути (см. 039_integrations.sql). На этом
// этапе пайплайн только доказывает, что канал работает: событие пишется в
// integration_events коротким summary (без сырого payload — там могут быть
// персональные данные клиента) и видно в карточке провайдера.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const MAX_SUMMARY_LENGTH = 500

async function parseBody(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get('content-type') || ''
  const raw = await request.text()
  if (!raw) return {}

  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(raw) as Record<string, unknown>
    } catch {
      return { raw: raw.slice(0, MAX_SUMMARY_LENGTH) }
    }
  }

  // Bitrix24/amoCRM по умолчанию шлют исходящие вебхуки как form-urlencoded.
  const params = new URLSearchParams(raw)
  return Object.fromEntries(params.entries())
}

function summarize(provider: string, body: Record<string, unknown>): string {
  const eventKey = ['event', 'event_type', 'eventType'].find(k => k in body)
  const event = eventKey ? String(body[eventKey]) : 'webhook'
  const keys = Object.keys(body).slice(0, 12).join(', ')
  const summary = `${provider}: событие «${event}», поля: ${keys || '—'}`
  return summary.slice(0, MAX_SUMMARY_LENGTH)
}

export async function receiveWebhook(
  request: Request,
  provider: 'bitrix24' | 'amocrm',
  secret: string,
): Promise<Response> {
  if (!secret) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data: connection } = await admin
    .from('integration_connections')
    .select('id')
    .eq('provider', provider)
    .eq('webhook_secret', secret)
    .maybeSingle()

  if (!connection) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 401 })
  }

  const body = await parseBody(request)
  const { error } = await admin.from('integration_events').insert({
    provider,
    payload_summary: summarize(provider, body),
  })

  if (error) {
    console.error(`[webhook:${provider}]`, error.message)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

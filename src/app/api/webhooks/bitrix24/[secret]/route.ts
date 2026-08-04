import { receiveWebhook } from '@/lib/integrations/webhook-receive'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type RouteContext = { params: Promise<{ secret: string }> }

export async function POST(request: Request, context: RouteContext) {
  const { secret } = await context.params
  return receiveWebhook(request, 'bitrix24', secret)
}

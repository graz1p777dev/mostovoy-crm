import { redirect } from 'next/navigation'
import { getShopBotSettings } from '@/actions/mostovoy-bot-settings'
import {
  approveShopBotReply,
  getShopBotApprovals,
  rejectShopBotReply,
} from '@/actions/mostovoy-bot-approvals'
import { ShopApiError } from '@/components/shop/ShopApiError'

export const dynamic = 'force-dynamic'

export default async function BotApprovalsPage() {
  const settings = await getShopBotSettings()
  if (!settings.ok) return <ShopApiError error={settings.error} />
  if (!settings.data.approvalEnabled) redirect('/dashboard/bot-analytics')

  const result = await getShopBotApprovals('pending')
  if (!result.ok) return <ShopApiError error={result.error} />
  const approvals = result.data.approvals ?? []

  return (
    <main className="space-y-5 p-4 md:p-8">
      <section className="rounded-3xl bg-gradient-to-br from-[#ff3045] via-[#ef1727] to-[#d90718] p-6 text-white shadow-[0_18px_44px_rgba(225,29,29,0.24)]">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/80">Ручное управление</p>
        <h1 className="mt-2 text-2xl font-bold">Подтверждение ответов</h1>
        <p className="mt-1 text-sm text-white/75">Проверьте черновик ИИ перед отправкой клиенту.</p>
      </section>

      {approvals.length === 0 ? (
        <section className="rounded-2xl bg-white p-8 text-center shadow-sm">
          <p className="font-semibold text-[#1b1517]">Новых ответов нет</p>
          <p className="mt-1 text-sm text-[#6b6063]">Все черновики уже обработаны.</p>
        </section>
      ) : approvals.map((approval) => (
        <article key={approval.id} className="grid gap-5 rounded-2xl bg-white p-5 shadow-sm lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold text-[#1b1517]">{approval.customerName}</h2>
              <span className="rounded-full bg-[#fff1f2] px-2.5 py-1 text-xs font-medium text-[#e11d1d]">{approval.source}</span>
            </div>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-[#8a7d80]">Сообщение клиента</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#3a3032]">{approval.customerMessage}</p>
            {approval.summary && (
              <div className="mt-4 rounded-xl bg-[#faf8f7] p-3">
                <p className="text-xs font-semibold text-[#6b6063]">Контекст диалога</p>
                <p className="mt-1 text-xs leading-5 text-[#6b6063]">{approval.summary}</p>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <form action={approveShopBotReply} className="space-y-3">
              <input type="hidden" name="id" value={approval.id} />
              <label className="block text-xs font-semibold uppercase tracking-wide text-[#8a7d80]" htmlFor={`reply-${approval.id}`}>Ответ клиенту</label>
              <textarea
                id={`reply-${approval.id}`}
                name="text"
                required
                defaultValue={approval.aiReply}
                className="min-h-40 w-full resize-y rounded-xl border border-[#ece6e7] bg-[#fdfbfb] p-3 text-sm leading-6 text-[#1b1517] outline-none transition focus:border-[#ef1727] focus:ring-2 focus:ring-[#ef1727]/10"
              />
              <button className="rounded-xl bg-[#e11d1d] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#c81414]">Подтвердить и отправить</button>
            </form>
            <form action={rejectShopBotReply} className="flex flex-col gap-2 sm:flex-row">
              <input type="hidden" name="id" value={approval.id} />
              <input name="reason" required placeholder="Причина отклонения" className="min-w-0 flex-1 rounded-xl border border-[#ece6e7] bg-white px-3 py-2.5 text-sm text-[#1b1517] outline-none focus:border-[#ef1727]" />
              <button className="rounded-xl border border-[#e11d1d] px-4 py-2.5 text-sm font-semibold text-[#e11d1d] transition hover:bg-[#fff1f2]">Отклонить</button>
            </form>
          </div>
        </article>
      ))}
    </main>
  )
}

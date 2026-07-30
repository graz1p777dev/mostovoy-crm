import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DashboardShell from './DashboardShell'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Вызываем createClient() здесь, на уровне Layout (вне Suspense),
  // чтобы cookies() был зарегистрирован до начала стриминга.
  // LeftPanel и RightPanel тоже вызывают createClient() внутри Suspense,
  // но к тому моменту динамический render-контекст уже установлен.
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) redirect('/auth/login')

  const { data: emp } = await supabase
    .from('employees')
    .select('must_change_password')
    .eq('user_id', session.user.id)
    .single()

  if (emp?.must_change_password) redirect('/auth/change-password')

  return <DashboardShell>{children}</DashboardShell>
}

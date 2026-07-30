import { createTokenClient } from '@/lib/supabase/token-client'
import {
  getTodayStats,
  getLiveFeed,
  getTeamNow,
  getTodaySchedule,
} from '@/lib/dashboard-queries'
import TodayCards from './TodayCards'
import LiveFeed from './LiveFeed'
import TeamNow from './TeamNow'
import TodaySchedule from './TodaySchedule'

interface RightPanelProps {
  dateStr: string
  role: string
  permissionLevel?: string
  employeeId?: string
  departmentId?: string | null
  accessToken: string
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="font-medium"
      style={{
        fontSize: 12,
        color: '#6b7280',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        marginBottom: 12,
      }}
    >
      {children}
    </p>
  )
}

export default async function RightPanel({
  dateStr,
  role,
  permissionLevel,
  employeeId,
  departmentId,
  accessToken,
}: RightPanelProps) {
  // Используем token-клиент вместо createClient() + cookies(),
  // так как cookies() нельзя вызывать внутри Suspense во время стриминга.
  //
  // ВАЖНО: accessToken не должен передаваться в дочерние Client Components,
  // и этот файл не должен получать директиву 'use client' —
  // иначе токен попадёт в JS-бандл и станет виден в браузере.
  const supabase = createTokenClient(accessToken)

  // permissionLevel используется для поддержки пользовательских ролей.
  const effectiveLevel = permissionLevel ?? (role === 'mp' || role === 'lmai' ? 'employee' : role === 'rop' ? 'department_head' : 'owner')
  const filterById = effectiveLevel === 'employee' ? employeeId : undefined
  const filterDept = effectiveLevel === 'department_head' ? (departmentId ?? undefined) : undefined

  const [todayStats, feedItems, teamMembers, scheduleItems] = await Promise.all([
    getTodayStats(supabase, dateStr, filterById),
    getLiveFeed(supabase, dateStr, filterById),
    (effectiveLevel === 'owner' || effectiveLevel === 'department_head')
      ? getTeamNow(supabase, dateStr, filterDept)
      : Promise.resolve([]),
    getTodaySchedule(supabase, dateStr, filterById),
  ])

  const currentTime = new Date().toTimeString().substring(0, 5)

  return (
    <div className="px-6 pb-6 flex flex-col gap-5">
      {/* Карточки дня */}
      <div>
        <SectionTitle>Итоги дня</SectionTitle>
        <TodayCards stats={todayStats} />
      </div>

      {/* Лента событий */}
      <div>
        <SectionTitle>Записи · лента</SectionTitle>
        <LiveFeed
          initialItems={feedItems}
          dateStr={dateStr}
          employeeId={filterById}
        />
      </div>

      {/* Команда сейчас */}
      {(effectiveLevel === 'owner' || effectiveLevel === 'department_head') && (
        <div>
          <SectionTitle>Команда сейчас</SectionTitle>
          <TeamNow members={teamMembers} />
        </div>
      )}

      {/* Расписание дня */}
      <div>
        <SectionTitle>Расписание дня</SectionTitle>
        <TodaySchedule items={scheduleItems} currentTime={currentTime} />
      </div>
    </div>
  )
}

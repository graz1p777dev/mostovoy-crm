import { getTasksData } from '@/actions/tasks'
import TasksBoard from '@/components/tasks/TasksBoard'

export const dynamic = 'force-dynamic'

export default async function TasksPage() {
  const { tasks, employees, departments, me } = await getTasksData()

  if (!me) {
    return <div className="p-8 text-sm text-gray-400">Нет доступа</div>
  }

  return (
    <TasksBoard
      initialTasks={tasks}
      employees={employees}
      departments={departments}
      me={me}
    />
  )
}

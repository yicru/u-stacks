import { client } from 'server/client'
import { CreateTaskForm } from '../../features/task/components/create-task-form'
import { TaskList } from '../../features/task/components/task-list'
import type { Route } from './+types/page'

export async function loader(_: Route.LoaderArgs) {
  const response = await client.api.tasks.$get()
  const result = await response.json()

  return {
    tasks: result.tasks,
  }
}

export default function Index({ loaderData }: Route.ComponentProps) {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <div className="w-full max-w-xl space-y-4 rounded bg-neutral-50 p-4">
        <h1 className="font-medium">Tasks</h1>
        <TaskList tasks={loaderData.tasks} />
        <CreateTaskForm />
      </div>
    </div>
  )
}

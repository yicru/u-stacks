import { parseResponse } from 'hono/client'
import { createFileRoute } from '@tanstack/react-router'
import { CreateTaskForm } from '@/features/task/components/create-task-form'
import { TaskList } from '@/features/task/components/task-list'
import { apiClient } from '@/lib/api-client'
import { Separator } from '@/components/ui/separator'

export const Route = createFileRoute('/')({
  ssr: false,
  loader: async () => {
    const result = await parseResponse(apiClient.api.tasks.$get({ query: {} }))
    return result
  },
  component: App,
})

function App() {
  const { data } = Route.useLoaderData()

  return (
    <main className="mx-auto max-w-xl space-y-8 px-4 py-16 sm:px-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-medium tracking-tight text-balance text-foreground">
          Tasks
        </h1>
        <p className="text-sm text-muted-foreground text-pretty">
          Manage your daily priorities and stay organized.
        </p>
      </div>
      <CreateTaskForm />
      <Separator className="my-8" />
      <TaskList tasks={data} />
    </main>
  )
}

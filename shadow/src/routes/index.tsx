import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { Schema } from 'effect'
import { TaskSearch } from '@shared/api/examples/task'
import { loadTasks } from '@/examples/task/load-tasks'
import { TaskView } from '@/examples/task/view'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/')({
  validateSearch: Schema.toStandardSchemaV1(TaskSearch),
  loaderDeps: ({ search }) => search,
  loader: ({ deps, abortController }) =>
    loadTasks(deps, abortController.signal),
  component: TaskPage,
  errorComponent: ({ reset }) => (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-12">
      <Alert variant="destructive">
        <AlertTitle>Could not load this page</AlertTitle>
        <AlertDescription>
          Check the cursor or try loading the page again.
        </AlertDescription>
      </Alert>
      <Button onClick={reset} className="self-start">
        Try again
      </Button>
      <Button
        variant="outline"
        render={<Link to="/" search={{ mode: 'basic' }} />}
        nativeButton={false}
        className="self-start"
      >
        First page
      </Button>
    </main>
  ),
})

function TaskPage() {
  const router = useRouter()
  const navigate = Route.useNavigate()
  const data = Route.useLoaderData()
  const search = Route.useSearch()

  return (
    <TaskView
      data={data}
      search={search}
      onMode={(mode) => {
        void navigate({ search: { mode } })
      }}
      onNext={(cursor) => {
        void navigate({ search: { ...search, cursor } })
      }}
      onRefresh={() =>
        router.invalidate({
          filter: (match) => match.routeId === '/',
          sync: true,
        })
      }
    />
  )
}

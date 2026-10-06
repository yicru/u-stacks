import type { TaskSearch } from '@shared/api/examples/task'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Separator } from '@/components/ui/separator'
import { CreateTaskForm } from './components/create-task-form'
import { TaskList } from './components/task-list'
import { TaskCursorView } from './cursor-view'
import type { loadTasks } from './load-tasks'

interface TaskViewProps {
  data: Awaited<ReturnType<typeof loadTasks>>
  search: typeof TaskSearch.Type
  onMode: (mode: typeof TaskSearch.Type.mode) => void
  onNext: (cursor: string | undefined) => void
  onRefresh: () => Promise<void>
}

export function TaskView({
  data,
  search,
  onMode,
  onNext,
  onRefresh,
}: TaskViewProps) {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-12 sm:px-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-medium text-balance">Tasks</h1>
        <p className="text-sm text-muted-foreground text-pretty">
          Manage your daily priorities and stay organized.
        </p>
      </header>
      <CreateTaskForm />
      <FieldGroup>
        <Field>
          <FieldLabel id="task-loading-mode">Data loading</FieldLabel>
          <ToggleGroup
            aria-labelledby="task-loading-mode"
            value={[search.mode]}
            variant="outline"
            size="sm"
            spacing={2}
            className="flex-wrap"
            onValueChange={(values) => {
              const value = values[0]
              if (
                value === 'basic' ||
                value === 'stream' ||
                value === 'parallel'
              ) {
                onMode(value)
              }
            }}
          >
            <ToggleGroupItem value="basic">Basic list</ToggleGroupItem>
            <ToggleGroupItem value="stream">List first</ToggleGroupItem>
            <ToggleGroupItem value="parallel">Wait for both</ToggleGroupItem>
          </ToggleGroup>
        </Field>
      </FieldGroup>
      {data.mode === 'basic' ? (
        <>
          <Separator />
          <TaskList tasks={data.list.data} />
        </>
      ) : (
        <TaskCursorView
          data={data}
          search={search}
          onNext={onNext}
          onRefresh={onRefresh}
        />
      )}
    </main>
  )
}

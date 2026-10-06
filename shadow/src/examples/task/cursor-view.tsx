import { Await } from '@tanstack/react-router'
import { Effect } from 'effect'
import { useState, useTransition } from 'react'
import type {
  TaskLookup,
  TaskPage,
  TaskSearch,
} from '@shared/api/examples/task'
import { apiClient } from '@/lib/api-client'
import { formatDateTime } from '@/lib/date'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Skeleton } from '@/components/ui/skeleton'
import type { Task } from '@shared/api/examples/task'
import type { loadTasks } from './load-tasks'
import { measureTaskMutation } from './measure-mutation'

type Data = Exclude<Awaited<ReturnType<typeof loadTasks>>, { mode: 'basic' }>

interface TaskCursorViewProps {
  data: Data
  search: typeof TaskSearch.Type
  onNext: (cursor: string | undefined) => void
  onRefresh: () => Promise<void>
}

function SummaryPanel({ summary }: Pick<Data, 'summary'>) {
  const placeholder = (
    <Skeleton className="h-16 w-full" aria-label="Loading task summary" />
  )
  return (
    <Card>
      <CardHeader>
        <CardTitle>Task summary</CardTitle>
        <CardDescription>
          Totals for all tasks, independent of the current page.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Await promise={summary} fallback={placeholder}>
          {(result) =>
            result.status === 'ready' ? (
              <dl className="grid grid-cols-3 gap-4 tabular-nums">
                <div>
                  <dt className="text-sm text-muted-foreground">Total</dt>
                  <dd className="text-2xl font-medium">{result.data.total}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">Open</dt>
                  <dd className="text-2xl font-medium">{result.data.open}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">Done</dt>
                  <dd className="text-2xl font-medium">{result.data.done}</dd>
                </div>
              </dl>
            ) : result.status === 'cancelled' ? (
              placeholder
            ) : (
              <Alert variant="destructive">
                <AlertTitle>Summary unavailable</AlertTitle>
                <AlertDescription>
                  The task list is still available. Refresh to try again.
                </AlertDescription>
              </Alert>
            )
          }
        </Await>
      </CardContent>
    </Card>
  )
}

function useCursorActions(onRefresh: () => Promise<void>) {
  const [lookup, setLookup] = useState<TaskLookup>()
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()

  const toggleTask = (task: Task) => {
    startTransition(async () => {
      setError(undefined)
      try {
        await measureTaskMutation('update', async () => {
          await Effect.runPromise(
            apiClient.tasks.updateTask({
              params: { id: task.id },
              payload: { done: !task.done },
            }),
          )
          await onRefresh()
        })
        startTransition(() => setLookup(undefined))
      } catch {
        startTransition(() => setError('Could not update the task. Try again.'))
      }
    })
  }

  const lookupSelected = (selected: ReadonlySet<string>) => {
    startTransition(async () => {
      setError(undefined)
      try {
        const result = await Effect.runPromise(
          apiClient.tasks.lookupTasks({
            payload: { ids: [...selected] },
          }),
        )
        startTransition(() => setLookup(result))
      } catch {
        startTransition(() =>
          setError('Could not load the selected tasks. Try again.'),
        )
      }
    })
  }

  return { lookup, error, pending, toggleTask, lookupSelected }
}

function ActionError({ message }: { message: string | undefined }) {
  if (!message) return null
  return (
    <Alert variant="destructive">
      <AlertTitle>Action failed</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}

function CursorTaskRow({
  task,
  selected,
  pending,
  onSelect,
  onToggle,
}: {
  task: Task
  selected: boolean
  pending: boolean
  onSelect: (checked: boolean) => void
  onToggle: (task: Task) => void
}) {
  const action = task.done ? 'Reopen' : 'Complete'
  return (
    <Field
      orientation="horizontal"
      data-disabled={pending || undefined}
      className="gap-3"
    >
      <Checkbox
        id={`task-select-${task.id}`}
        aria-label={`Select ${task.title}`}
        checked={selected}
        disabled={pending}
        onCheckedChange={onSelect}
      />
      <FieldLabel
        htmlFor={`task-select-${task.id}`}
        className="min-w-0 flex-1 truncate"
      >
        {task.title}
      </FieldLabel>
      <span className="hidden text-xs text-muted-foreground tabular-nums sm:block">
        {formatDateTime(task.createdAt)}
      </span>
      <Badge variant="secondary">{task.done ? 'Done' : 'Open'}</Badge>
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        aria-label={`${action} ${task.title}`}
        onClick={() => onToggle(task)}
      >
        {action}
      </Button>
    </Field>
  )
}

function CursorTaskList({
  tasks,
  selected,
  pending,
  onSelect,
  onToggle,
}: {
  tasks: ReadonlyArray<Task>
  selected: ReadonlySet<string>
  pending: boolean
  onSelect: (id: string, checked: boolean) => void
  onToggle: (task: Task) => void
}) {
  if (tasks.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No tasks on this page</EmptyTitle>
          <EmptyDescription>
            Add a task above or return to the first page.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }
  return (
    <FieldGroup className="gap-3">
      {tasks.map((task) => (
        <CursorTaskRow
          key={task.id}
          task={task}
          selected={selected.has(task.id)}
          pending={pending}
          onSelect={(checked) => onSelect(task.id, checked)}
          onToggle={onToggle}
        />
      ))}
    </FieldGroup>
  )
}

function LookupResults({ lookup }: { lookup: TaskLookup | undefined }) {
  if (!lookup) return null
  return (
    <section
      aria-label="Selected tasks"
      className="flex flex-col gap-2"
      aria-live="polite"
    >
      <h3 className="text-sm font-medium text-balance">Selected tasks</h3>
      <ul className="flex flex-col gap-1 text-sm">
        {lookup.data.map((task) => (
          <li key={task.id}>
            {task.title} · {task.done ? 'Done' : 'Open'}
          </li>
        ))}
      </ul>
      {lookup.missingIds.length > 0 && (
        <p className="text-sm text-muted-foreground text-pretty">
          {lookup.missingIds.length} selected tasks are no longer available.
        </p>
      )}
    </section>
  )
}

function PageNavigation({
  cursor,
  pending,
  onNext,
}: {
  cursor: string | null
  pending: boolean
  onNext: (cursor: string | undefined) => void
}) {
  return (
    <CardFooter className="flex-wrap gap-3">
      <Button
        variant="outline"
        disabled={pending}
        onClick={() => onNext(undefined)}
      >
        First page
      </Button>
      <Button
        disabled={pending || cursor === null}
        onClick={() => onNext(cursor ?? undefined)}
      >
        Next page
      </Button>
    </CardFooter>
  )
}

function CursorRows({
  page,
  onRefresh,
  onNext,
}: {
  page: TaskPage
  onRefresh: () => Promise<void>
  onNext: (cursor: string | undefined) => void
}) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const { lookup, error, pending, toggleTask, lookupSelected } =
    useCursorActions(onRefresh)
  const select = (id: string, checked: boolean) => {
    setSelected((ids) => {
      const next = new Set(ids)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tasks</CardTitle>
        <CardDescription>
          Browse newest first. Select tasks to retrieve them together.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ActionError message={error} />
        <CursorTaskList
          tasks={page.data}
          selected={selected}
          pending={pending}
          onSelect={select}
          onToggle={toggleTask}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            disabled={pending || selected.size === 0}
            onClick={() => lookupSelected(selected)}
          >
            Load selected tasks
          </Button>
          <span className="text-sm text-muted-foreground tabular-nums">
            {selected.size} selected
          </span>
        </div>
        <LookupResults lookup={lookup} />
      </CardContent>
      <PageNavigation
        cursor={page.nextCursor}
        pending={pending}
        onNext={onNext}
      />
    </Card>
  )
}

export function TaskCursorView({
  data,
  search,
  onNext,
  onRefresh,
}: TaskCursorViewProps) {
  return (
    <>
      <CursorRows
        key={`${search.mode}:${search.cursor ?? 'first'}`}
        page={data.page}
        onRefresh={onRefresh}
        onNext={onNext}
      />
      <SummaryPanel summary={data.summary} />
    </>
  )
}

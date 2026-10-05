import { Await, Link } from '@tanstack/react-router'
import { Effect } from 'effect'
import { useState, useTransition } from 'react'
import type {
  ReferenceLookup,
  ReferencePage,
  ReferenceSearch,
} from '@shared/api/reference'
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
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { Task } from '@shared/api/task'
import type { loadReference } from './load'

type Mode = typeof ReferenceSearch.Type.mode
type Data = Awaited<ReturnType<typeof loadReference>>

interface ReferenceViewProps {
  data: Data
  search: typeof ReferenceSearch.Type
  onMode: (mode: Mode) => void
  onNext: (cursor: string | undefined) => void
  onRefresh: () => Promise<void>
}

function SummaryPanel({ summary }: Pick<Data, 'summary'>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Task summary</CardTitle>
        <CardDescription>
          Totals for all tasks, independent of the current page.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Await
          promise={summary}
          fallback={
            <Skeleton
              className="h-16 w-full"
              aria-label="Loading task summary"
            />
          }
        >
          {(result) =>
            result.ok ? (
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

function useReferenceActions(onRefresh: () => Promise<void>) {
  const [lookup, setLookup] = useState<ReferenceLookup>()
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()

  const toggleTask = (task: Task) => {
    startTransition(async () => {
      setError(undefined)
      try {
        await Effect.runPromise(
          apiClient.tasks.updateTask({
            params: { id: task.id },
            payload: { done: !task.done },
          }),
        )
        await onRefresh()
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
        const { referenceClient } = await import('./client')
        const result = await Effect.runPromise(
          referenceClient.reference.lookupTasks({
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

function ReferenceTaskRow({
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
        id={`reference-${task.id}`}
        aria-label={`Select ${task.title}`}
        checked={selected}
        disabled={pending}
        onCheckedChange={onSelect}
      />
      <FieldLabel
        htmlFor={`reference-${task.id}`}
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

function ReferenceTaskList({
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
            Add a task or return to the first page.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button render={<Link to="/" />} nativeButton={false}>
            Add a task
          </Button>
        </EmptyContent>
      </Empty>
    )
  }
  return (
    <FieldGroup className="gap-3">
      {tasks.map((task) => (
        <ReferenceTaskRow
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

function LookupResults({ lookup }: { lookup: ReferenceLookup | undefined }) {
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

function ReferenceRows({
  page,
  onRefresh,
  onNext,
}: {
  page: ReferencePage
  onRefresh: () => Promise<void>
  onNext: (cursor: string | undefined) => void
}) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const { lookup, error, pending, toggleTask, lookupSelected } =
    useReferenceActions(onRefresh)
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
        <ReferenceTaskList
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

export function ReferenceView({
  data,
  search,
  onMode,
  onNext,
  onRefresh,
}: ReferenceViewProps) {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-12 sm:px-6">
      <header className="flex flex-col gap-3">
        <Button
          variant="link"
          render={<Link to="/" />}
          nativeButton={false}
          className="self-start"
        >
          Back to tasks
        </Button>
        <h1 className="text-3xl font-medium text-balance">
          Reference patterns
        </h1>
        <p className="text-muted-foreground text-pretty">
          Cursor pagination, independent data loading, and grouped task
          retrieval.
        </p>
      </header>
      <FieldGroup>
        <Field>
          <FieldLabel id="reference-loading-mode">Data loading</FieldLabel>
          <ToggleGroup
            aria-labelledby="reference-loading-mode"
            value={[search.mode]}
            variant="outline"
            onValueChange={(values) => {
              const value = values[0]
              if (value === 'stream' || value === 'parallel') onMode(value)
            }}
          >
            <ToggleGroupItem value="stream">List first</ToggleGroupItem>
            <ToggleGroupItem value="parallel">Wait for both</ToggleGroupItem>
          </ToggleGroup>
        </Field>
      </FieldGroup>
      <ReferenceRows
        key={search.cursor ?? 'first'}
        page={data.page}
        onRefresh={onRefresh}
        onNext={onNext}
      />
      <SummaryPanel summary={data.summary} />
    </main>
  )
}

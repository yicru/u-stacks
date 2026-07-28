import { Effect } from 'effect'
import { useRouter } from '@tanstack/react-router'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { cva } from 'class-variance-authority'
import { HugeiconsIcon } from '@hugeicons/react'
import { Delete02Icon, TaskDone01Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import { formatDateTime } from '@/lib/date'
import { apiClient } from '@/lib/api-client'
import type { Task } from '@shared/api/task'

interface TaskListProps {
  tasks: ReadonlyArray<Task>
}

interface TaskListItemProps {
  task: Task
  disabled: boolean
  onToggle: (task: Task) => void
  onDelete: (id: string) => void
}

interface MutationMessages {
  success?: string
  error: string
}

function useTaskActions() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const runMutation = (
    operation: () => Promise<unknown>,
    messages: MutationMessages,
  ) => {
    startTransition(async () => {
      try {
        await operation()
        router.invalidate()
        if (messages.success) {
          toast.success(messages.success)
        }
      } catch {
        toast.error(messages.error)
      }
    })
  }

  const handleToggle = (task: Task) => {
    runMutation(
      () =>
        Effect.runPromise(
          apiClient.tasks.updateTask({
            path: { id: task.id },
            payload: { done: !task.done },
          }),
        ),
      { error: 'Failed to update task' },
    )
  }

  const handleDelete = (id: string) => {
    runMutation(
      () =>
        Effect.runPromise(
          apiClient.tasks.deleteTask({
            path: { id },
          }),
        ),
      { success: 'Task deleted', error: 'Failed to delete task' },
    )
  }

  return { handleDelete, handleToggle, isPending }
}

function EmptyTaskList() {
  return (
    <Empty className="mt-6 rounded-xl border border-dashed bg-transparent py-16">
      <EmptyHeader>
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-muted/50">
          <HugeiconsIcon
            icon={TaskDone01Icon}
            className="size-6 text-muted-foreground"
            strokeWidth={1.5}
          />
        </div>
        <EmptyTitle className="text-balance text-lg font-medium">
          All caught up
        </EmptyTitle>
        <EmptyDescription className="mt-1 text-pretty text-sm text-muted-foreground">
          You don't have any tasks right now. Add one above to get started.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

const taskItemVariants = cva(
  'group/task flex items-center gap-3 rounded-lg border bg-card p-3 shadow-xs transition-all hover:border-border/80',
  {
    variants: {
      completed: {
        true: 'border-transparent bg-muted/20 shadow-none hover:border-transparent',
        false: 'border-border/50',
      },
    },
  },
)

function TaskListItem({
  task,
  disabled,
  onToggle,
  onDelete,
}: TaskListItemProps) {
  return (
    <div
      data-completed={task.done}
      className={taskItemVariants({ completed: task.done })}
    >
      <Checkbox
        checked={task.done}
        onCheckedChange={() => onToggle(task)}
        disabled={disabled}
        className="transition-opacity group-data-[completed=true]/task:opacity-60"
      />
      <span className="flex-1 text-sm font-medium text-foreground transition-colors group-data-[completed=true]/task:text-muted-foreground group-data-[completed=true]/task:line-through">
        {task.title}
      </span>
      <span className="tabular-nums text-xs text-muted-foreground opacity-100 transition-opacity group-data-[completed=true]/task:opacity-50">
        {task.createdAt ? formatDateTime(task.createdAt) : '-'}
      </span>
      <Button
        disabled={disabled}
        size="icon-xs"
        variant="ghost"
        aria-label="Delete task"
        onClick={() => onDelete(task.id)}
        className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
      >
        <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} className="size-4" />
      </Button>
    </div>
  )
}

export function TaskList({ tasks }: TaskListProps) {
  const { handleDelete, handleToggle, isPending } = useTaskActions()

  if (tasks.length === 0) {
    return <EmptyTaskList />
  }

  return (
    <div className="flex flex-col gap-2 pt-2">
      {tasks.map((task) => (
        <TaskListItem
          key={task.id}
          task={task}
          disabled={isPending}
          onToggle={handleToggle}
          onDelete={handleDelete}
        />
      ))}
    </div>
  )
}

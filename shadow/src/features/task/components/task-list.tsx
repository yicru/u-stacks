import type { InferResponseType } from 'hono/client'
import { parseResponse } from 'hono/client'
import { useRouter } from '@tanstack/react-router'
import { useTransition } from 'react'
import { toast } from 'sonner'
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
import { cn } from '@/lib/utils'
import { formatDateTime } from '@/lib/date'
import { apiClient } from '@/lib/api-client'

type TasksResponse = InferResponseType<typeof apiClient.api.tasks.$get>
type Task = TasksResponse['data'][number]

interface TaskListProps {
  tasks: TasksResponse['data']
}

export function TaskList({ tasks }: TaskListProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const handleToggle = (task: Task) => {
    startTransition(async () => {
      try {
        await parseResponse(
          apiClient.api.tasks[':id'].$put({
            param: { id: task.id },
            json: { done: !task.done },
          }),
        )
        router.invalidate()
      } catch {
        toast.error('Failed to update task')
      }
    })
  }

  const handleDelete = (id: string) => {
    startTransition(async () => {
      try {
        await parseResponse(
          apiClient.api.tasks[':id'].$delete({
            param: { id },
          }),
        )
        router.invalidate()
        toast.success('Task deleted')
      } catch {
        toast.error('Failed to delete task')
      }
    })
  }

  if (tasks.length === 0) {
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

  return (
    <div className="flex flex-col gap-2 pt-2">
      {tasks.map((task) => (
        <div
          key={task.id}
          className={cn(
            'group flex items-center gap-3 rounded-lg border bg-card p-3 shadow-xs transition-all hover:border-border/80',
            task.done
              ? 'border-transparent bg-muted/20 shadow-none hover:border-transparent'
              : 'border-border/50',
          )}
        >
          <Checkbox
            checked={task.done}
            onCheckedChange={() => handleToggle(task)}
            disabled={isPending}
            className={cn('transition-opacity', task.done && 'opacity-60')}
          />
          <span
            className={cn(
              'flex-1 text-sm font-medium transition-colors',
              task.done
                ? 'text-muted-foreground line-through'
                : 'text-foreground',
            )}
          >
            {task.title}
          </span>
          <span
            className={cn(
              'tabular-nums text-xs text-muted-foreground transition-opacity',
              task.done ? 'opacity-50' : 'opacity-100',
            )}
          >
            {task.createdAt
              ? formatDateTime(task.createdAt)
              : '-'}
          </span>
          <Button
            disabled={isPending}
            size="icon-xs"
            variant="ghost"
            aria-label="Delete task"
            onClick={() => handleDelete(task.id)}
            className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          >
            <HugeiconsIcon
              icon={Delete02Icon}
              strokeWidth={2}
              className="size-4"
            />
          </Button>
        </div>
      ))}
    </div>
  )
}

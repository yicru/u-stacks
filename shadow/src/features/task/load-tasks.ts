import { createClientOnlyFn } from '@tanstack/react-start'
import { Effect } from 'effect'
import type { TaskListQuery } from '@shared/api/task'
import { apiClient } from '@/lib/api-client'

export const loadTasks = createClientOnlyFn(
  (query: TaskListQuery, signal: AbortSignal) =>
    Effect.runPromise(apiClient.tasks.getTasks({ query }), { signal }),
)

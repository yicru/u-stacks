import { createIsomorphicFn } from '@tanstack/react-start'
import { Effect } from 'effect'
import type { TaskListQuery } from '@shared/api/task'
import { apiClient } from '@/lib/api-client'

export const loadTasks = createIsomorphicFn()
  .server(async (query: TaskListQuery, signal: AbortSignal) => {
    const { loadTasks: loadOnServer } = await import('@server/task-loader')
    return loadOnServer(query, signal)
  })
  .client((query: TaskListQuery, signal: AbortSignal) =>
    Effect.runPromise(apiClient.tasks.getTasks({ query }), { signal }),
  )

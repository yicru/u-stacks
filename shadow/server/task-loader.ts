import { Effect } from 'effect'
import { TaskService } from '@server/modules/task/service'
import type { TaskListQuery } from '@shared/api/task'
import { runtime } from './runtime'

export function loadTasks(query: TaskListQuery, signal: AbortSignal) {
  return runtime.runPromise(
    Effect.flatMap(TaskService, (service) => service.list(query)),
    { signal },
  )
}

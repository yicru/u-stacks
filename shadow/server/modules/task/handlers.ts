import { Effect } from 'effect'
import { HttpApiBuilder } from 'effect/unstable/httpapi'
import { AppApi } from '@shared/api'
import { TaskService } from './service'

export const TaskHandlersLive = HttpApiBuilder.group(
  AppApi,
  'tasks',
  Effect.fn('TaskHandlers')(function* (handlers) {
    const service = yield* TaskService
    return handlers
      .handle('getTasks', ({ query }) => service.list(query))
      .handle('getTask', ({ params }) => service.get(params.id))
      .handle('createTask', ({ payload }) => service.create(payload))
      .handle('updateTask', ({ params, payload }) =>
        service.update(params.id, payload),
      )
      .handle('deleteTask', ({ params }) => service.remove(params.id))
  }),
)

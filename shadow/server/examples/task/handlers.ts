import { Effect } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'
import { AppApi } from '@shared/api'
import { TaskService } from './service'

export const TaskHandlersLive = HttpApiBuilder.group(
  AppApi,
  'tasks',
  Effect.fn('TaskHandlers')(function* (handlers) {
    const service = yield* TaskService
    return handlers
      .handle('getTasks', ({ query }) => service.list(query))
      .handle('getTaskPage', ({ query }) => service.page(query))
      .handle('getTaskSummary', () => service.summary())
      .handle('getTaskOverview', ({ query }) => service.overview(query))
      .handle('lookupTasks', ({ payload }) => service.lookup(payload.ids))
      .handle('getTask', ({ params }) => service.get(params.id))
      .handle('createTask', ({ payload }) => service.create(payload))
      .handle('updateTask', ({ params, payload }) =>
        service.update(params.id, payload),
      )
      .handle('deleteTask', ({ params }) => service.remove(params.id))
  }),
)

import { HttpApiBuilder } from '@effect/platform'
import { Effect } from 'effect'
import { ShadowApi } from '@shared/api'
import { TaskService } from './service'

export const TaskHandlersLive = HttpApiBuilder.group(
  ShadowApi,
  'tasks',
  (handlers) =>
    handlers
      .handle('getTasks', ({ urlParams }) =>
        Effect.flatMap(TaskService, (service) => service.list(urlParams)),
      )
      .handle('getTask', ({ path }) =>
        Effect.flatMap(TaskService, (service) => service.get(path.id)),
      )
      .handle('createTask', ({ payload }) =>
        Effect.flatMap(TaskService, (service) => service.create(payload)),
      )
      .handle('updateTask', ({ path, payload }) =>
        Effect.flatMap(TaskService, (service) =>
          service.update(path.id, payload),
        ),
      )
      .handle('deleteTask', ({ path }) =>
        Effect.flatMap(TaskService, (service) => service.remove(path.id)),
      ),
)

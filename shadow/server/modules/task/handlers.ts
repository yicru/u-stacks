import { HttpApiBuilder } from '@effect/platform'
import { Effect } from 'effect'
import { ShadowApi } from '@shared/api'
import { TaskService } from './service'

export const TaskHandlersLive = HttpApiBuilder.group(
  ShadowApi,
  'tasks',
  (handlers) =>
    handlers
      .handle('list', ({ urlParams }) =>
        Effect.flatMap(TaskService, (service) =>
          service.list(urlParams),
        ),
      )
      .handle('get', ({ path }) =>
        Effect.flatMap(TaskService, (service) =>
          service.get(path.id),
        ),
      )
      .handle('create', ({ payload }) =>
        Effect.flatMap(TaskService, (service) =>
          service.create(payload),
        ),
      )
      .handle('update', ({ path, payload }) =>
        Effect.flatMap(TaskService, (service) =>
          service.update(path.id, payload),
        ),
      )
      .handle('remove', ({ path }) =>
        Effect.flatMap(TaskService, (service) =>
          service.remove(path.id),
        ),
      ),
)

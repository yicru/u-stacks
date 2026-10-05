import { Layer } from 'effect'
import { HttpServer } from 'effect/http'
import { HttpApiBuilder } from 'effect/http-api'
import { HealthCheckHandlersLive } from '@server/modules/health-check/handlers'
import { TaskHandlersLive } from '@server/modules/task/handlers'
import { TaskService } from '@server/modules/task/service'
import { AppApi } from '@shared/api'
import { SchemaErrorMiddlewareLive } from '@shared/api/schema-error-middleware'
import { makeHttpApiHandler, type ApiRequestMetrics } from './http-api-handler'

const ApiHandlersLive = Layer.mergeAll(
  HealthCheckHandlersLive,
  TaskHandlersLive,
)

export const makeApiHandler = <E>(
  taskServiceLayer: Layer.Layer<TaskService, E>,
  options?: {
    readonly memoMap?: Layer.MemoMap
    readonly onRequest?: (metrics: ApiRequestMetrics) => void
  },
) => {
  const api = HttpApiBuilder.layer(AppApi).pipe(
    Layer.provide(ApiHandlersLive.pipe(Layer.provide(taskServiceLayer))),
    Layer.provide(SchemaErrorMiddlewareLive),
    Layer.provide(HttpServer.layerServices),
  )
  return makeHttpApiHandler(api, options)
}

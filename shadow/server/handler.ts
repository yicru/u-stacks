import { Layer } from 'effect'
import { HttpServer } from 'effect/http'
import { HttpApiBuilder } from 'effect/http-api'
import { HealthCheckHandlersLive } from '@server/modules/health-check/handlers'
import { TaskHandlersLive } from '@server/examples/task/handlers'
import { AppApi } from '@shared/api'
import {
  type SchemaErrorMiddleware,
  SchemaErrorMiddlewareLive,
} from '@shared/api/schema-error-middleware'
import { makeHttpApiHandler, type ApiRequestMetrics } from './http-api-handler'

const ApiHandlersLive = Layer.mergeAll(
  HealthCheckHandlersLive,
  TaskHandlersLive,
)

export const makeApiHandler = <E>(
  serviceLayer: Layer.Layer<
    Exclude<Layer.Services<typeof ApiHandlersLive>, SchemaErrorMiddleware>,
    E
  >,
  options?: {
    readonly memoMap?: Layer.MemoMap
    readonly onRequest?: (metrics: ApiRequestMetrics) => void
  },
) => {
  const api = HttpApiBuilder.layer(AppApi).pipe(
    Layer.provide(ApiHandlersLive.pipe(Layer.provide(serviceLayer))),
    Layer.provide(SchemaErrorMiddlewareLive),
    Layer.provide(HttpServer.layerServices),
  )
  return makeHttpApiHandler(api, options)
}

import { Layer } from 'effect'
import { HttpRouter, HttpServer } from 'effect/unstable/http'
import { HttpApiBuilder } from 'effect/unstable/httpapi'
import { HealthCheckHandlersLive } from '@server/modules/health-check/handlers'
import { TaskHandlersLive } from '@server/modules/task/handlers'
import { TaskService } from '@server/modules/task/service'
import { AppApi } from '@shared/api'
import { NotFoundError } from '@shared/api/errors'
import { SchemaErrorMiddlewareLive } from '@shared/api/schema-error-middleware'

const ApiHandlersLive = Layer.mergeAll(
  HealthCheckHandlersLive,
  TaskHandlersLive,
)

export const makeApiHandler = <E>(
  taskServiceLayer: Layer.Layer<TaskService, E>,
) => {
  const api = HttpApiBuilder.layer(AppApi).pipe(
    Layer.provide(ApiHandlersLive.pipe(Layer.provide(taskServiceLayer))),
    Layer.provide(SchemaErrorMiddlewareLive),
    Layer.provide(HttpServer.layerServices),
  )
  const web = HttpRouter.toWebHandler(api, { disableLogger: true })

  return {
    dispose: web.dispose,
    handler: async (request: Request) => {
      const response = await web.handler(request)
      if (response.status !== 404) {
        return response
      }
      const body = await response
        .clone()
        .json()
        .catch(() => undefined)
      if (typeof body === 'object' && body !== null && 'code' in body) {
        return response
      }
      return Response.json(
        NotFoundError.makeNotFound(
          `The requested endpoint ${new URL(request.url).pathname} was not found`,
        ),
        { status: 404 },
      )
    },
  }
}

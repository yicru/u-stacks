import { HttpApiBuilder, HttpServer } from '@effect/platform'
import { Layer } from 'effect'
import { HealthCheckHandlersLive } from '@server/modules/health-check/handlers'
import { TaskHandlersLive } from '@server/modules/task/handlers'
import { TaskService } from '@server/modules/task/service'
import { ShadowApi } from '@shared/api'
import { ApiError } from '@shared/api/errors'

const ApiHandlersLive = Layer.mergeAll(
  HealthCheckHandlersLive,
  TaskHandlersLive,
)

export const makeApiHandler = <E>(
  taskServiceLayer: Layer.Layer<TaskService, E, never>,
) => {
  const handlers = ApiHandlersLive.pipe(Layer.provide(taskServiceLayer))
  const api = HttpApiBuilder.api(ShadowApi).pipe(Layer.provide(handlers))
  const web = HttpApiBuilder.toWebHandler(
    Layer.mergeAll(api, HttpServer.layerContext),
  )

  return {
    dispose: web.dispose,
    handler: async (request: Request) => {
      const response = await web.handler(request)
      if (response.status === 400) {
        const body = await response
          .clone()
          .json()
          .catch(() => undefined)
        if (
          typeof body === 'object' &&
          body !== null &&
          '_tag' in body &&
          body._tag === 'HttpApiDecodeError' &&
          'issues' in body &&
          Array.isArray(body.issues)
        ) {
          return Response.json(ApiError.validation(body.issues), {
            status: 400,
          })
        }
      }
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
        ApiError.notFound(
          `The requested endpoint ${new URL(request.url).pathname} was not found`,
        ),
        { status: 404 },
      )
    },
  }
}

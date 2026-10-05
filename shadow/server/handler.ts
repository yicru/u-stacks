import { Context, Effect, Layer } from 'effect'
import { HttpRouter, HttpServer } from 'effect/http'
import { HttpApiBuilder } from 'effect/http-api'
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

export interface ApiRequestMetrics {
  readonly method: string
  readonly route: string
  readonly status: number | undefined
  readonly outcome: 'success' | 'client_error' | 'server_error' | 'aborted'
  readonly durationMs: number
}

function requestOutcome(
  request: Request,
  status = 500,
): ApiRequestMetrics['outcome'] {
  if (request.signal.aborted) return 'aborted'
  if (status >= 500) return 'server_error'
  return status >= 400 ? 'client_error' : 'success'
}

const MatchedRoute = Context.Reference<{ path: string } | undefined>(
  '@server/MatchedRoute',
  { defaultValue: () => undefined },
)

const ObserveRoute = HttpRouter.middleware((httpEffect) =>
  Effect.gen(function* () {
    const observation = yield* MatchedRoute
    const { route } = yield* HttpRouter.RouteContext
    if (observation) {
      observation.path = route.path
    }
    return yield* httpEffect
  }),
).layer

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
    Layer.provide(ObserveRoute),
  )
  const web = HttpRouter.toWebHandler(api, {
    disableLogger: true,
    memoMap: options?.memoMap,
  })

  return {
    dispose: web.dispose,
    handler: async (request: Request) => {
      const observation = { path: 'unmatched' }
      const started = performance.now()
      let response: Response | undefined
      try {
        response = await web.handler(
          request,
          Context.make(MatchedRoute, observation),
        )
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
        response = Response.json(
          NotFoundError.makeNotFound(
            `The requested endpoint ${new URL(request.url).pathname} was not found`,
          ),
          { status: 404 },
        )
        return response
      } finally {
        const status = response?.status
        try {
          options?.onRequest?.({
            method: request.method,
            route: observation.path,
            status,
            outcome: requestOutcome(request, status),
            durationMs: performance.now() - started,
          })
        } catch {}
      }
    },
  }
}

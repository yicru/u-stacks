import { HttpApiBuilder, HttpServer } from '@effect/platform'
import { Layer, Option, Schema } from 'effect'
import { HealthCheckHandlersLive } from '@server/modules/health-check/handlers'
import { TaskHandlersLive } from '@server/modules/task/handlers'
import { TaskService } from '@server/modules/task/service'
import { AppApi } from '@shared/api'
import { ApiError } from '@shared/api/errors'

const ApiHandlersLive = Layer.mergeAll(
  HealthCheckHandlersLive,
  TaskHandlersLive,
)

const HttpApiDecodeError = Schema.Struct({
  _tag: Schema.Literal('HttpApiDecodeError'),
  issues: Schema.Array(Schema.Unknown),
})

const ApiErrorBody = Schema.Struct({
  code: Schema.String,
})

const readResponseBody = (response: Response): Promise<unknown> =>
  response
    .clone()
    .json()
    .catch(() => undefined)

const normalizeDecodeError = async (response: Response): Promise<Response> => {
  const body = await readResponseBody(response)
  const decodeError = Schema.decodeUnknownOption(HttpApiDecodeError)(body)

  return Option.match(decodeError, {
    onNone: () => response,
    onSome: ({ issues }) =>
      Response.json(ApiError.validation(issues), { status: 400 }),
  })
}

const normalizeNotFound = async (
  request: Request,
  response: Response,
): Promise<Response> => {
  const body = await readResponseBody(response)
  if (Schema.is(ApiErrorBody)(body)) {
    return response
  }

  return Response.json(
    ApiError.notFound(
      `The requested endpoint ${new URL(request.url).pathname} was not found`,
    ),
    { status: 404 },
  )
}

export const makeApiHandler = <E>(
  taskServiceLayer: Layer.Layer<TaskService, E, never>,
) => {
  const handlers = ApiHandlersLive.pipe(Layer.provide(taskServiceLayer))
  const api = HttpApiBuilder.api(AppApi).pipe(Layer.provide(handlers))
  const web = HttpApiBuilder.toWebHandler(
    Layer.mergeAll(api, HttpServer.layerContext),
  )

  return {
    dispose: web.dispose,
    handler: async (request: Request) => {
      const response = await web.handler(request)
      if (response.status === 400) {
        return normalizeDecodeError(response)
      }
      if (response.status === 404) {
        return normalizeNotFound(request, response)
      }
      return response
    },
  }
}

import { Effect, Layer, Schema } from 'effect'
import { HttpServer } from 'effect/http'
import {
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiGroup,
} from 'effect/http-api'
import { afterAll, describe, expect, it } from 'vite-plus/test'
import {
  InternalError,
  NotFoundError,
  ValidationError,
} from '@shared/api/errors'
import { HealthCheckApi } from '@shared/api/health-check'
import {
  SchemaErrorMiddleware,
  SchemaErrorMiddlewareLive,
} from '@shared/api/schema-error-middleware'
import { HealthCheckHandlersLive } from './modules/health-check/handlers'
import { makeHttpApiHandler, type ApiRequestMetrics } from './http-api-handler'

class ProbeApi extends HttpApiGroup.make('probe').add(
  HttpApiEndpoint.get('read', '/probe/:id', {
    params: Schema.Struct({ id: Schema.String }),
    query: Schema.Struct({
      limit: Schema.optionalKey(
        Schema.NumberFromString.check(Schema.isGreaterThan(0)),
      ),
    }),
    success: Schema.Struct({ message: Schema.Literal('ok') }),
    error: [InternalError, NotFoundError],
  }),
) {}

class TestApi extends HttpApi.make('app')
  .add(HealthCheckApi)
  .add(ProbeApi)
  .middleware(SchemaErrorMiddleware)
  .prefix('/api') {}

function makeServer({
  read = () => Effect.succeed({ message: 'ok' as const }),
  onRequest,
}: {
  readonly read?: () => Effect.Effect<
    { readonly message: 'ok' },
    InternalError | NotFoundError
  >
  readonly onRequest?: (metrics: ApiRequestMetrics) => void
} = {}) {
  const api = HttpApiBuilder.layer(TestApi).pipe(
    Layer.provide(HealthCheckHandlersLive),
    Layer.provide(
      HttpApiBuilder.group(TestApi, 'probe', (handlers) =>
        handlers.handle('read', read),
      ),
    ),
    Layer.provide(SchemaErrorMiddlewareLive),
    Layer.provide(HttpServer.layerServices),
  )
  return makeHttpApiHandler(api, { onRequest })
}

function makeGate() {
  let resolve = () => {}
  const promise = new Promise<void>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}

describe('shared HTTP API handler', () => {
  const { handler, dispose } = makeServer()

  afterAll(() => dispose())

  it('serves the existing health check endpoint', async () => {
    const response = await handler(
      new Request('http://localhost/api/health-check'),
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ message: 'ok' })
  })

  it('normalizes request decode failures', async () => {
    const response = await handler(
      new Request('http://localhost/api/probe/example?limit=0'),
    )
    const body = Schema.decodeUnknownSync(ValidationError)(
      await response.json(),
    )
    expect(response.status).toBe(400)
    expect(body).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Validation Error',
    })
    expect(Array.isArray(body.detail)).toBe(true)
  })

  it('normalizes unknown endpoints without replacing declared not-found errors', async () => {
    const response = await handler(new Request('http://localhost/api/unknown'))
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      code: 'NOT_FOUND',
      message: 'The requested endpoint /api/unknown was not found',
    })
    const server = makeServer({
      read: () => Effect.fail(NotFoundError.makeNotFound('Missing resource')),
    })
    try {
      const declared = await server.handler(
        new Request('http://localhost/api/probe/missing'),
      )
      expect(declared.status).toBe(404)
      expect(await declared.json()).toEqual({
        code: 'NOT_FOUND',
        message: 'Missing resource',
      })
    } finally {
      await server.dispose()
    }
  })

  it('isolates overlapping request metrics and omits IDs and query values', async () => {
    const started = makeGate()
    const release = makeGate()
    const metrics: ApiRequestMetrics[] = []
    const server = makeServer({
      read: () =>
        Effect.promise(async () => {
          started.resolve()
          await release.promise
          return { message: 'ok' as const }
        }),
      onRequest: (metric) => metrics.push(metric),
    })
    try {
      const slow = server.handler(
        new Request(
          'http://localhost/api/probe/private-resource-id?token=private-query-value',
        ),
      )
      await started.promise
      await server.handler(new Request('http://localhost/api/health-check'))
      await server.handler(new Request('http://localhost/api/private-path'))
      release.resolve()
      await slow
      expect(
        metrics.map(({ route, status, outcome }) => ({
          route,
          status,
          outcome,
        })),
      ).toEqual([
        { route: '/api/health-check', status: 200, outcome: 'success' },
        { route: 'unmatched', status: 404, outcome: 'client_error' },
        { route: '/api/probe/:id', status: 200, outcome: 'success' },
      ])
      expect(
        metrics.every(
          ({ durationMs }) => Number.isFinite(durationMs) && durationMs >= 0,
        ),
      ).toBe(true)
      expect(JSON.stringify(metrics)).not.toMatch(/private-/)
    } finally {
      release.resolve()
      await server.dispose()
    }
  })

  it('records aborted requests separately from server failures', async () => {
    const started = makeGate()
    const metrics: ApiRequestMetrics[] = []
    let aborted = false
    const server = makeServer({
      read: () =>
        aborted
          ? Effect.fail(InternalError.makeInternal())
          : Effect.sync(() => started.resolve()).pipe(
              Effect.andThen(Effect.never),
            ),
      onRequest: (metric) => metrics.push(metric),
    })
    try {
      const controller = new AbortController()
      const request = server.handler(
        new Request('http://localhost/api/probe/example', {
          signal: controller.signal,
        }),
      )
      await started.promise
      controller.abort()
      await request.catch(() => undefined)
      aborted = true
      await server.handler(new Request('http://localhost/api/probe/example'))
      expect(metrics.map(({ route, outcome }) => ({ route, outcome }))).toEqual(
        [
          { route: '/api/probe/:id', outcome: 'aborted' },
          { route: '/api/probe/:id', outcome: 'server_error' },
        ],
      )
      expect(metrics[1]?.status).toBe(500)
    } finally {
      await server.dispose()
    }
  })

  it('preserves HTTP responses when the metrics sink throws', async () => {
    const server = makeServer({
      onRequest: () => {
        throw new Error('Metrics unavailable')
      },
    })
    try {
      const response = await server.handler(
        new Request('http://localhost/api/health-check'),
      )
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ message: 'ok' })
    } finally {
      await server.dispose()
    }
  })
})

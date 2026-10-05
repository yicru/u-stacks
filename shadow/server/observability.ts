import { tracing } from 'cloudflare:workers'
import { Layer } from 'effect'
import { DatabaseTracing } from '@server/db/tracing'
import type { ApiRequestMetrics } from './handler'

export const CloudflareDatabaseTracing = Layer.succeed(DatabaseTracing, {
  query: <A>(name: string, operation: () => Promise<A>) =>
    tracing.enterSpan(`db.${name}`, async (span) => {
      const started = performance.now()
      let outcome = 'success'
      span.setAttributes({
        'db.system.name': 'sqlite',
        'db.operation.name': name,
      })
      try {
        return await operation()
      } catch (error) {
        outcome = 'error'
        span.recordException({
          code: 'DATABASE_ERROR',
          message: 'Database operation failed',
        })
        span.setStatus({ code: 'error' })
        throw error
      } finally {
        try {
          console.info(
            JSON.stringify({
              event: 'db.query',
              operation: name,
              outcome,
              durationMs: performance.now() - started,
            }),
          )
        } catch {}
      }
    }),
})

export function recordApiRequest(metrics: ApiRequestMetrics) {
  const span = tracing.getActiveSpan()
  span?.setAttributes({
    'http.route': metrics.route,
    'app.outcome': metrics.outcome,
  })
  if (metrics.outcome === 'server_error') {
    span?.setStatus({ code: 'error' })
  }
  console.info(JSON.stringify({ event: 'api.request', ...metrics }))
}

export function traceApiRequest(
  request: Request,
  operation: () => Promise<Response>,
) {
  return tracing.enterSpan('api.handle', async (span) => {
    span.setAttribute('http.request.method', request.method)
    let response: Response
    try {
      response = await operation()
    } catch (error) {
      if (!request.signal.aborted) {
        span.recordException({
          code: 'API_ERROR',
          message: 'API request failed',
        })
        span.setStatus({ code: 'error' })
      }
      throw error
    }
    span.setAttribute('http.response.status_code', response.status)
    return response
  })
}

import { Effect, Layer } from 'effect'
import { HttpServer } from 'effect/http'
import { HttpApiBuilder } from 'effect/http-api'
import { ReferenceApi } from '@shared/api/reference'
import { SchemaErrorMiddlewareLive } from '@shared/api/schema-error-middleware'
import {
  makeHttpApiHandler,
  type ApiRequestMetrics,
} from '@server/http-api-handler'
import { ReferenceService } from './service'

const ReferenceHandlers = HttpApiBuilder.group(
  ReferenceApi,
  'reference',
  Effect.fn('ReferenceHandlers')(function* (handlers) {
    const service = yield* ReferenceService
    return handlers
      .handle('getPage', ({ query }) => service.page(query))
      .handle('getSummary', () => service.summary())
      .handle('getOverview', ({ query }) => service.overview(query))
      .handle('lookupTasks', ({ payload }) => service.lookup(payload.ids))
  }),
)

export const makeReferenceHandler = <E>(
  service: Layer.Layer<ReferenceService, E>,
  options?: {
    readonly memoMap?: Layer.MemoMap
    readonly onRequest?: (metrics: ApiRequestMetrics) => void
  },
) =>
  makeHttpApiHandler(
    HttpApiBuilder.layer(ReferenceApi).pipe(
      Layer.provide(ReferenceHandlers.pipe(Layer.provide(service))),
      Layer.provide(SchemaErrorMiddlewareLive),
      Layer.provide(HttpServer.layerServices),
    ),
    options,
  )

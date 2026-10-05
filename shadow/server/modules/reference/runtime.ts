import { Effect, Layer, ManagedRuntime } from 'effect'
import { DatabaseLive } from '@server/db/live'
import { CloudflareDatabaseTracing } from '@server/observability'
import { memoMap } from '@server/runtime'
import type { ReferencePageQuery } from '@shared/api/reference'
import { ReferenceService } from './service'

export const ReferenceProduction = ReferenceService.Live.pipe(
  Layer.provide(DatabaseLive),
  Layer.provide(CloudflareDatabaseTracing),
)

const runtime = ManagedRuntime.make(ReferenceProduction, { memoMap })

export const loadPage = (query: ReferencePageQuery, signal: AbortSignal) =>
  runtime.runPromise(
    Effect.flatMap(ReferenceService, (service) => service.page(query)),
    { signal },
  )

export const loadSummary = (signal: AbortSignal) =>
  runtime.runPromise(
    Effect.flatMap(ReferenceService, (service) => service.summary()),
    { signal },
  )

export const loadOverview = (query: ReferencePageQuery, signal: AbortSignal) =>
  runtime.runPromise(
    Effect.flatMap(ReferenceService, (service) => service.overview(query)),
    { signal },
  )

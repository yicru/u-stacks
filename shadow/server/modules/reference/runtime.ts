import { Layer } from 'effect'
import { DatabaseLive } from '@server/db/live'
import { CloudflareDatabaseTracing } from '@server/observability'
import { ReferenceService } from './service'

export const ReferenceProduction = ReferenceService.Live.pipe(
  Layer.provide(DatabaseLive),
  Layer.provide(CloudflareDatabaseTracing),
)

import { Layer } from 'effect'
import { DatabaseLive } from '@server/db/live'
import { TaskService } from '@server/examples/task/service'
import { CloudflareDatabaseTracing } from './observability'

export const memoMap = Layer.makeMemoMapUnsafe()
export const ApiServicesProduction = TaskService.Live.pipe(
  Layer.provide(DatabaseLive),
  Layer.provide(CloudflareDatabaseTracing),
)

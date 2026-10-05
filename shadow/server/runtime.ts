import { Layer } from 'effect'
import { DatabaseLive } from '@server/db/live'
import { TaskService } from '@server/modules/task/service'
import { CloudflareDatabaseTracing } from './observability'

export const memoMap = Layer.makeMemoMapUnsafe()
export const TaskServiceProduction = TaskService.Live.pipe(
  Layer.provide(DatabaseLive),
  Layer.provide(CloudflareDatabaseTracing),
)

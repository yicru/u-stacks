import { Layer } from 'effect'
import { DatabaseLive } from '@server/db/live'
import { TaskServiceLive } from '@server/modules/task/service'
import { makeApiHandler } from './handler'

const TaskServiceProduction = TaskServiceLive.pipe(Layer.provide(DatabaseLive))

export const { dispose, handler } = makeApiHandler(TaskServiceProduction)

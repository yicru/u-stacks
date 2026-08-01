import { Layer } from 'effect'
import { DatabaseLive } from '@server/db/live'
import { TaskService } from '@server/modules/task/service'
import { makeApiHandler } from './handler'

const TaskServiceProduction = TaskService.Live.pipe(Layer.provide(DatabaseLive))

export const { handler } = makeApiHandler(TaskServiceProduction)

import { HttpApi } from '@effect/platform'
import { ApiError } from './errors'
import { HealthCheckApi } from './health-check'
import { TaskApi } from './task'

export class AppApi extends HttpApi.make('app')
  .add(HealthCheckApi)
  .add(TaskApi)
  .addError(ApiError.Validation, { status: 400 })
  .prefix('/api') {}

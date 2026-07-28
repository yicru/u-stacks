import { HttpApi } from '@effect/platform'
import { ApiError } from './errors'
import { HealthCheckApi } from './health-check'
import { TaskApi } from './task'

export class ShadowApi extends HttpApi.make('shadow')
  .add(HealthCheckApi)
  .add(TaskApi)
  .addError(ApiError.Validation, { status: 400 })
  .prefix('/api') {}

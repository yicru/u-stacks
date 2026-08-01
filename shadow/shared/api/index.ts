import { HttpApi } from 'effect/unstable/httpapi'
import { HealthCheckApi } from './health-check'
import { SchemaErrorMiddleware } from './schema-error-middleware'
import { TaskApi } from './task'

export class AppApi extends HttpApi.make('app')
  .add(HealthCheckApi)
  .add(TaskApi)
  .middleware(SchemaErrorMiddleware)
  .prefix('/api') {}

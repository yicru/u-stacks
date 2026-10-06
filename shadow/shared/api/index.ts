import { HttpApi } from 'effect/http-api'
import { HealthCheckApi } from './health-check'
import { SchemaErrorMiddleware } from './schema-error-middleware'
import { TaskApi } from './examples/task'

export class AppApi extends HttpApi.make('app')
  .add(HealthCheckApi)
  .add(TaskApi)
  .middleware(SchemaErrorMiddleware)
  .prefix('/api') {}

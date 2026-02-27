import { createApp } from './factory'
import { HealthCheckApp } from '@server/modules/health-check'
import { TaskApp } from '@server/modules/task'

const app = createApp().basePath('/api')

const routes = app
  .route('/health-check', HealthCheckApp)
  .route('/tasks', TaskApp)

export default app
export type AppType = typeof routes

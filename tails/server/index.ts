import { authApp } from '@server/routes/auth'
import { taskApp } from '@server/routes/task'
import { createApp } from './factory'

const app = createApp().basePath('/api')

const routes = app.route('/auth', authApp).route('/tasks', taskApp)

export default app
export type AppType = typeof routes

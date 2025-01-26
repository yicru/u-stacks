import { createApp } from './factory'
import { rootRoute } from './routes/root'
import { taskRoute } from './routes/task'

const app = createApp()

const route = app.route('/api', rootRoute).route('/api/tasks', taskRoute)

export default app

export type AppType = typeof route

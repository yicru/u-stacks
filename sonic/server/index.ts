import { createApp } from './factory'
import { rootRoute } from './routes/root'
import { taskRoute } from './routes/task'

const app = createApp()

app.use(async (c, next) => {
  await next()
  c.header('X-Powered-By', 'React Router and Hono')
})

const route = app.route('/api', rootRoute).route('/api/tasks', taskRoute)

export default app

export type AppType = typeof route

import { createApp } from './factory'
import { rootRoute } from './routes/root'
import { taskRoute } from './routes/task'

const app = createApp().basePath('/api')

app.use(async (c, next) => {
  await next()
  c.header('X-Powered-By', 'React Router and Hono')
})

const route = app.route('/', rootRoute).route('/tasks', taskRoute)

export default app

export type AppType = typeof route

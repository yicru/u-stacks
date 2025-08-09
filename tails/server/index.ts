import { authApp } from '@server/routes/auth'
import { createApp } from './factory'

const app = createApp().basePath('/api')

const routes = app.route('/auth', authApp)

export default app
export type AppType = typeof routes

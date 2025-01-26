import { createApp } from '../factory'

const app = createApp()

export const rootRoute = app.get('/', (c) => {
  const authUser = c.get('authUser')

  return c.json({
    message: 'Hello',
    authUser,
  })
})

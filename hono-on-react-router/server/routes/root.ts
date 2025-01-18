import { createApp } from '../factory'

const app = createApp()

export const rootRoute = app.get('/', (c) => {
  return c.json({
    message: 'Hello',
  })
})

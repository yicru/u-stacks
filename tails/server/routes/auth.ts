import { createApp } from '@server/factory'
import { auth } from '@server/lib/auth'

export const authApp = createApp().on(['POST', 'GET'], '*', (c) =>
  auth.handler(c.req.raw),
)

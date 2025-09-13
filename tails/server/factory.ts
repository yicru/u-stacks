import { db } from '@server/db'
import type { auth } from '@server/lib/auth'
import { requireAuth } from '@server/lib/auth-utils'
import { Hono } from 'hono'

type Env = {
  Variables: {
    db: typeof db
    requireAuth: () => Promise<{
      user: typeof auth.$Infer.Session.user
      session: typeof auth.$Infer.Session.session
    }>
  }
  Bindings: CloudflareEnv
}

export const createApp = () => {
  const app = new Hono<Env>()

  app.use(async (c, next) => {
    c.set('db', db)
    c.set('requireAuth', async () => requireAuth(c.req.raw.headers))
    await next()
  })

  return app
}

import type { PrismaClient } from '@server/generated/prisma/client'
import type { auth } from '@server/lib/auth'
import { requireAuth } from '@server/lib/auth-utils'
import prisma from '@server/lib/prisma'
import { Hono } from 'hono'

type Env = {
  Variables: {
    db: PrismaClient
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
    c.set('db', prisma)
    c.set('requireAuth', async () => requireAuth(c.req.raw.headers))
    await next()
  })

  return app
}

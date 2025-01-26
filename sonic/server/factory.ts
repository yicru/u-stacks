import { clerkMiddleware, getAuth } from '@hono/clerk-auth'
import { PrismaClient, type User } from '@prisma/client'
import { Hono } from 'hono'
import { serverEnv } from 'lib/env.server'
import { clientEnv } from '../lib/env'

export type AppEnv = {
  Variables: {
    db: PrismaClient
    authUser: User | null
  }
}

export const createApp = () => {
  const app = new Hono<AppEnv>()

  app.use(
    '*',
    clerkMiddleware({
      secretKey: serverEnv.CLERK_SECRET_KEY,
      publishableKey: clientEnv.VITE_CLERK_PUBLISHABLE_KEY,
    }),
  )

  app.use(async (c, next) => {
    const db = new PrismaClient()
    c.set('db', db)
    await next()
  })

  app.use(async (c, next) => {
    const auth = getAuth(c)

    if (!auth?.userId) {
      c.set('authUser', null)
      await next()
      return
    }

    let authUser: User | null = await c.var.db.user.findUnique({
      where: {
        uid: auth.userId,
      },
    })

    if (!authUser) {
      authUser = await c.var.db.user.create({
        data: {
          uid: auth.userId,
        },
      })
    }

    c.set('authUser', authUser)
    await next()
  })

  return app
}

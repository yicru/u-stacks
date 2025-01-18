import { PrismaClient } from '@prisma/client'
import { Hono } from 'hono'

export type AppEnv = {
  Variables: {
    db: PrismaClient
  }
}

export const createApp = () => {
  const app = new Hono<AppEnv>()

  app.use(async (c, next) => {
    const db = new PrismaClient()
    c.set('db', db)
    await next()
  })

  return app
}

import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { createApp } from '../factory'

const app = createApp()

export const taskRoute = app
  .get('/', async (c) => {
    const authUser = c.get('authUser')

    if (!authUser) {
      return c.json({ tasks: [] })
    }

    const tasks = await c.var.db.task.findMany({
      where: {
        userId: authUser.id,
      },
    })
    return c.json({ tasks })
  })
  .post(
    '/',
    zValidator(
      'json',
      z.object({
        title: z.string(),
      }),
    ),
    async (c) => {
      const authUser = c.get('authUser')

      if (!authUser) {
        throw new Error('Unauthorized')
      }

      const json = await c.req.valid('json')

      const task = await c.var.db.task.create({
        data: {
          userId: authUser.id,
          title: json.title,
        },
      })

      return c.json({ task })
    },
  )

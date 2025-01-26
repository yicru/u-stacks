import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { createApp } from '../factory'

const app = createApp()

export const taskRoute = app
  .get('/', async (c) => {
    const tasks = await c.var.db.task.findMany()
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
      const json = await c.req.valid('json')

      const task = await c.var.db.task.create({
        data: {
          title: json.title,
        },
      })

      return c.json({ task })
    },
  )

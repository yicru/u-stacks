import { zValidator } from '@hono/zod-validator'
import { createApp } from '@server/factory'
import { successResponse } from '@server/lib/api-helpers'
import prisma from '@server/lib/prisma'
import { z } from 'zod'

export const taskApp = createApp()
  .get('/', async (c) => {
    const auth = await c.var.requireAuth()

    const tasks = await prisma.task.findMany({
      where: {
        userId: auth.user.id,
      },
    })

    return successResponse(c, { tasks })
  })
  .post('/', zValidator('json', z.object({ title: z.string() })), async (c) => {
    const auth = await c.var.requireAuth()
    const input = c.req.valid('json')

    const task = await prisma.task.create({
      data: {
        userId: auth.user.id,
        title: input.title,
      },
    })

    return successResponse(c, { task })
  })
  .delete(
    '/:id',
    zValidator('param', z.object({ id: z.string() })),
    async (c) => {
      const auth = await c.var.requireAuth()
      const param = c.req.valid('param')

      const task = await prisma.task.delete({
        where: {
          id: param.id,
          userId: auth.user.id,
        },
      })

      return successResponse(c, { task })
    },
  )

import { zValidator } from '@hono/zod-validator'
import { tasks } from '@server/db/schema'
import { createApp } from '@server/factory'
import { successResponse } from '@server/lib/api-helpers'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

export const taskApp = createApp()
  .get('/', async (c) => {
    const auth = await c.var.requireAuth()

    const result = await c.var.db
      .select()
      .from(tasks)
      .where(eq(tasks.userId, auth.user.id))

    return successResponse(c, { tasks: result })
  })
  .post('/', zValidator('json', z.object({ title: z.string() })), async (c) => {
    const auth = await c.var.requireAuth()
    const input = c.req.valid('json')

    const [task] = await c.var.db
      .insert(tasks)
      .values({
        userId: auth.user.id,
        title: input.title,
        updatedAt: new Date(),
      })
      .returning()

    return successResponse(c, { task })
  })
  .delete(
    '/:id',
    zValidator('param', z.object({ id: z.string() })),
    async (c) => {
      const auth = await c.var.requireAuth()
      const param = c.req.valid('param')

      const [task] = await c.var.db
        .delete(tasks)
        .where(and(eq(tasks.id, param.id), eq(tasks.userId, auth.user.id)))
        .returning()

      return successResponse(c, { task })
    },
  )

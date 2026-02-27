import { createApp } from '@server/factory'
import { zValidator } from '@server/lib/validator'
import { TaskModel } from './model'
import { TaskService } from './service'

export const TaskApp = createApp()
  .get('/', zValidator('query', TaskModel.ListQuery), async (c) => {
    const query = c.req.valid('query')
    const result = await TaskService.list(query)
    return c.json(result)
  })
  .get('/:id', zValidator('param', TaskModel.UpdateParam), async (c) => {
    const { id } = c.req.valid('param')
    const result = await TaskService.get(id)
    return c.json({ data: result })
  })
  .post('/', zValidator('json', TaskModel.CreateBody), async (c) => {
    const body = c.req.valid('json')
    const result = await TaskService.create(body)
    return c.json(result, 201)
  })
  .put(
    '/:id',
    zValidator('param', TaskModel.UpdateParam),
    zValidator('json', TaskModel.UpdateBody),
    async (c) => {
      const { id } = c.req.valid('param')
      const body = c.req.valid('json')
      const result = await TaskService.update(id, body)
      return c.json(result)
    },
  )
  .delete('/:id', zValidator('param', TaskModel.DeleteParam), async (c) => {
    const { id } = c.req.valid('param')
    const result = await TaskService.delete(id)
    return c.json(result)
  })

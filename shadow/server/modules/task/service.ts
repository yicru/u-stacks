import { db } from '@server/db'
import { tasks } from '@server/db/schema'
import { NotFoundError } from '@server/lib/errors'
import { toPaginatedResponse, withPagination } from '@server/lib/pagination'
import { count, eq, getTableColumns } from 'drizzle-orm'
import type { TaskModel } from './model'

export const TaskService = {
  async list(query: TaskModel.ListQuery): Promise<TaskModel.ListResponse> {
    const q = db.select({ ...getTableColumns(tasks) }).from(tasks)

    const [data, [{ total }]] = await Promise.all([
      withPagination(q.$dynamic(), {
        page: query.page,
        perPage: query.perPage,
      }),
      db.select({ total: count() }).from(tasks),
    ])

    return toPaginatedResponse(data, {
      page: query.page,
      perPage: query.perPage,
      total,
    })
  },

  async get(id: string): Promise<TaskModel.Task> {
    const [data] = await db
      .select({ ...getTableColumns(tasks) })
      .from(tasks)
      .where(eq(tasks.id, id))

    if (!data) {
      throw new NotFoundError(`Task with id ${id} not found`)
    }

    return data
  },

  async create(body: TaskModel.CreateBody): Promise<TaskModel.CreateResponse> {
    const [data] = await db
      .insert(tasks)
      .values(body)
      .returning({ ...getTableColumns(tasks) })
    return { data }
  },

  async update(
    id: string,
    body: TaskModel.UpdateBody,
  ): Promise<TaskModel.UpdateResponse> {
    const [data] = await db
      .update(tasks)
      .set(body)
      .where(eq(tasks.id, id))
      .returning({ ...getTableColumns(tasks) })

    if (!data) {
      throw new NotFoundError(`Task with id ${id} not found`)
    }

    return { data }
  },

  async delete(id: string): Promise<TaskModel.DeleteResponse> {
    const [data] = await db
      .delete(tasks)
      .where(eq(tasks.id, id))
      .returning({ id: tasks.id })

    if (!data) {
      throw new NotFoundError(`Task with id ${id} not found`)
    }

    return { success: true }
  },
}

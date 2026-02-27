import { tasks } from '@server/db/schema'
import { paginationMetaSchema } from '@server/lib/pagination'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { z } from 'zod'

export namespace TaskModel {
  export const Task = createSelectSchema(tasks)
  export type Task = z.infer<typeof Task>

  export const ListQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    perPage: z.coerce.number().int().min(1).max(50).default(10),
  })
  export type ListQuery = z.infer<typeof ListQuery>

  export const ListResponse = z.object({
    data: z.array(Task),
    meta: paginationMetaSchema,
  })
  export type ListResponse = z.infer<typeof ListResponse>

  export const CreateBody = createInsertSchema(tasks).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  export type CreateBody = z.infer<typeof CreateBody>

  export const CreateResponse = z.object({ data: Task })
  export type CreateResponse = z.infer<typeof CreateResponse>

  export const UpdateParam = z.object({ id: z.string() })
  export type UpdateParam = z.infer<typeof UpdateParam>

  export const UpdateBody = createInsertSchema(tasks)
    .omit({
      id: true,
      createdAt: true,
      updatedAt: true,
    })
    .partial()
  export type UpdateBody = z.infer<typeof UpdateBody>

  export const UpdateResponse = z.object({ data: Task })
  export type UpdateResponse = z.infer<typeof UpdateResponse>

  export const DeleteParam = z.object({ id: z.string() })
  export type DeleteParam = z.infer<typeof DeleteParam>

  export const DeleteResponse = z.object({ success: z.boolean() })
  export type DeleteResponse = z.infer<typeof DeleteResponse>
}

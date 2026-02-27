---
name: 'module'
root: 'server/modules'
output: '**/*'
questions:
  name: 'Please enter a module name.'
  crud:
    confirm: 'Do you need CRUD templates?'
---

# `{{ inputs.name | kebab }}/index.ts`

```typescript
{{ if inputs.crud }}
import { zValidator } from '@server/lib/validator'
import { createApp } from '@server/factory'
import { {{ inputs.name | pascal }}Service } from './service'
import { {{ inputs.name | pascal }}Model } from './model'

export const {{ inputs.name | pascal }}App = createApp()
  .get('/', zValidator('query', {{ inputs.name | pascal }}Model.ListQuery), async (c) => {
    const query = c.req.valid('query')
    const result = await {{ inputs.name | pascal }}Service.list(query)
    return c.json(result)
  })
  .get('/:id', zValidator('param', {{ inputs.name | pascal }}Model.GetParam), async (c) => {
    const param = c.req.valid('param')
    const result = await {{ inputs.name | pascal }}Service.get(param)
    return c.json(result)
  })
  .post('/', zValidator('json', {{ inputs.name | pascal }}Model.CreateBody), async (c) => {
    const body = c.req.valid('json')
    const result = await {{ inputs.name | pascal }}Service.create(body)
    return c.json(result)
  })
  .put('/:id', zValidator('param', {{ inputs.name | pascal }}Model.UpdateParam), zValidator('json', {{ inputs.name | pascal }}Model.UpdateBody), async (c) => {
    const param = c.req.valid('param')
    const body = c.req.valid('json')
    const result = await {{ inputs.name | pascal }}Service.update(param, body)
    return c.json(result)
  })
  .delete('/:id', zValidator('param', {{ inputs.name | pascal }}Model.DeleteParam), async (c) => {
    const param = c.req.valid('param')
    const result = await {{ inputs.name | pascal }}Service.delete(param)
    return c.json(result)
  })
{{ else }}
import { createApp } from '@server/factory'

export const {{ inputs.name | pascal }}App = createApp()
{{ end }}
```

# `{{ inputs.name | kebab }}/service.ts`

```typescript
{{ if inputs.crud }}
import { db } from '@server/db'
import { {{ inputs.name | camel | plur }} } from '@server/db/schema'
import { NotFoundError } from '@server/lib/errors'
import { toPaginatedResponse, withPagination } from '@server/lib/pagination'
import { count, eq, getTableColumns } from 'drizzle-orm'
import type { {{ inputs.name | pascal }}Model } from './model'

export const {{ inputs.name | pascal }}Service = {
  async list(query: {{ inputs.name | pascal }}Model.ListQuery): Promise<{{ inputs.name | pascal }}Model.ListResponse> {
    const q = db.select({ ...getTableColumns({{ inputs.name | camel | plur }}) }).from({{ inputs.name | camel | plur }})

    const [data, [{ total }]] = await Promise.all([
      withPagination(q.$dynamic(), {
        page: query.page,
        perPage: query.perPage,
      }),
      db.select({ total: count() }).from({{ inputs.name | camel | plur }}),
    ])

    return toPaginatedResponse(data, {
      page: query.page,
      perPage: query.perPage,
      total,
    })
  },

  async get(param: {{ inputs.name | pascal }}Model.GetParam): Promise<{{ inputs.name | pascal }}Model.GetResponse> {
    const data = await db.select({ ...getTableColumns({{ inputs.name | camel | plur }}) }).from({{ inputs.name | camel | plur }}).where(eq({{ inputs.name | camel | plur }}.id, param.id))
    if (data.length === 0) {
      throw new NotFoundError('{{ inputs.name | pascal }} not found')
    }
    return { data: data[0] }
  },

  async create(body: {{ inputs.name | pascal }}Model.CreateBody): Promise<{{ inputs.name | pascal }}Model.CreateResponse> {
    const [data] = await db.insert({{ inputs.name | camel | plur }}).values(body).returning({ ...getTableColumns({{ inputs.name | camel | plur }}) })
    return { data }
  },

  async update(param: {{ inputs.name | pascal }}Model.UpdateParam, body: {{ inputs.name | pascal }}Model.UpdateBody): Promise<{{ inputs.name | pascal }}Model.UpdateResponse> {
    const [data] = await db.update({{ inputs.name | camel | plur }}).set(body).where(eq({{ inputs.name | camel | plur }}.id, param.id)).returning({ ...getTableColumns({{ inputs.name | camel | plur }}) })
    if (!data) {
      throw new NotFoundError('{{ inputs.name | pascal }} not found')
    }
    return { data }
  },

  async delete(param: {{ inputs.name | pascal }}Model.DeleteParam): Promise<{{ inputs.name | pascal }}Model.DeleteResponse> {
    const [data] = await db.delete({{ inputs.name | camel | plur }}).where(eq({{ inputs.name | camel | plur }}.id, param.id)).returning({ ...getTableColumns({{ inputs.name | camel | plur }}) })
    if (!data) {
      throw new NotFoundError('{{ inputs.name | pascal }} not found')
    }
    return { success: true }
  },
}
{{ else }}
export const {{ inputs.name | pascal }}Service = {}
{{ end }}
```

# `{{ inputs.name | kebab }}/model.ts`

```typescript
{{ if inputs.crud }}
import { {{ inputs.name | camel | plur }} } from '@server/db/schema'
import { paginationMetaSchema } from '@server/lib/pagination'
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod'
import { z } from 'zod'

export namespace {{ inputs.name | pascal }}Model {
  export const {{ inputs.name | pascal }} = createSelectSchema({{ inputs.name | camel | plur }})
  export type {{ inputs.name | pascal }} = z.infer<typeof {{ inputs.name | pascal }}>

  export const ListQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    perPage: z.coerce.number().int().min(1).max(50).default(10),
  })
  export type ListQuery = z.infer<typeof ListQuery>

  export const ListResponse = z.object({
    data: z.array({{ inputs.name | pascal }}),
    meta: paginationMetaSchema,
  })
  export type ListResponse = z.infer<typeof ListResponse>

  export const GetParam = z.object({ id: z.string() })
  export type GetParam = z.infer<typeof GetParam>

  export const GetResponse = z.object({ data: {{ inputs.name | pascal }} })
  export type GetResponse = z.infer<typeof GetResponse>

  export const CreateBody = createInsertSchema({{ inputs.name | camel | plur }}).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  export type CreateBody = z.infer<typeof CreateBody>

  export const CreateResponse = z.object({ data: {{ inputs.name | pascal }} })
  export type CreateResponse = z.infer<typeof CreateResponse>

  export const UpdateParam = z.object({ id: z.string() })
  export type UpdateParam = z.infer<typeof UpdateParam>

  export const UpdateBody = createUpdateSchema({{ inputs.name | camel | plur }}).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  export type UpdateBody = z.infer<typeof UpdateBody>

  export const UpdateResponse = z.object({ data: {{ inputs.name | pascal }} })
  export type UpdateResponse = z.infer<typeof UpdateResponse>

  export const DeleteParam = z.object({ id: z.string() })
  export type DeleteParam = z.infer<typeof DeleteParam>

  export const DeleteResponse = z.object({ success: z.boolean() })
  export type DeleteResponse = z.infer<typeof DeleteResponse>
}
{{ else }}
import { z } from 'zod'

export namespace {{ inputs.name | pascal }}Model {}
{{ end }}
```

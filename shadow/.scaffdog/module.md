---
name: 'module'
root: '.'
output: '**/*'
questions:
  name: 'Please enter a module name.'
---

# `shared/api/{{ inputs.name | kebab }}.ts`

```typescript
import { Schema } from 'effect'
import {
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema,
} from 'effect/unstable/httpapi'
import { InternalError, NotFoundError } from './errors'
import { PaginationMeta, PaginationQuery } from './pagination'

export const {{ inputs.name | pascal }} = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  createdAt: Schema.DateFromString,
  updatedAt: Schema.DateFromString,
})
export type {{ inputs.name | pascal }} = typeof {{ inputs.name | pascal }}.Type

export const {{ inputs.name | pascal }}ListQuery = PaginationQuery
export type {{ inputs.name | pascal }}ListQuery = typeof {{ inputs.name | pascal }}ListQuery.Type

export const {{ inputs.name | pascal }}ListResponse = Schema.Struct({
  data: Schema.Array({{ inputs.name | pascal }}),
  meta: PaginationMeta,
})
export type {{ inputs.name | pascal }}ListResponse = typeof {{ inputs.name | pascal }}ListResponse.Type

export const {{ inputs.name | pascal }}Path = Schema.Struct({
  id: Schema.String.check(Schema.isMinLength(1)),
})

export const {{ inputs.name | pascal }}CreateBody = Schema.Struct({
  name: Schema.String.check(Schema.isMinLength(1)),
})
export type {{ inputs.name | pascal }}CreateBody = typeof {{ inputs.name | pascal }}CreateBody.Type

export const {{ inputs.name | pascal }}UpdateBody = Schema.Struct({
  name: Schema.optionalKey(Schema.String.check(Schema.isMinLength(1))),
})
export type {{ inputs.name | pascal }}UpdateBody = typeof {{ inputs.name | pascal }}UpdateBody.Type

export const {{ inputs.name | pascal }}Response = Schema.Struct({
  data: {{ inputs.name | pascal }},
})
export type {{ inputs.name | pascal }}Response = typeof {{ inputs.name | pascal }}Response.Type

export const {{ inputs.name | pascal }}DeleteResponse = Schema.Struct({
  success: Schema.Literal(true),
})

export class {{ inputs.name | pascal }}Api extends HttpApiGroup.make(
  '{{ inputs.name | camel | plur }}',
)
  .add(
    HttpApiEndpoint.get(
      'get{{ inputs.name | plur | pascal }}',
      '/{{ inputs.name | kebab | plur }}',
      {
        query: {{ inputs.name | pascal }}ListQuery,
        success: {{ inputs.name | pascal }}ListResponse,
        error: InternalError,
      },
    ),
  )
  .add(
    HttpApiEndpoint.get(
      'get{{ inputs.name | pascal }}',
      '/{{ inputs.name | kebab | plur }}/:id',
      {
        params: {{ inputs.name | pascal }}Path,
        success: {{ inputs.name | pascal }}Response,
        error: [NotFoundError, InternalError],
      },
    ),
  )
  .add(
    HttpApiEndpoint.post(
      'create{{ inputs.name | pascal }}',
      '/{{ inputs.name | kebab | plur }}',
      {
        payload: {{ inputs.name | pascal }}CreateBody,
        success: {{ inputs.name | pascal }}Response.pipe(
          HttpApiSchema.status(201),
        ),
        error: InternalError,
      },
    ),
  )
  .add(
    HttpApiEndpoint.put(
      'update{{ inputs.name | pascal }}',
      '/{{ inputs.name | kebab | plur }}/:id',
      {
        params: {{ inputs.name | pascal }}Path,
        payload: {{ inputs.name | pascal }}UpdateBody,
        success: {{ inputs.name | pascal }}Response,
        error: [NotFoundError, InternalError],
      },
    ),
  )
  .add(
    HttpApiEndpoint.delete(
      'delete{{ inputs.name | pascal }}',
      '/{{ inputs.name | kebab | plur }}/:id',
      {
        params: {{ inputs.name | pascal }}Path,
        success: {{ inputs.name | pascal }}DeleteResponse,
        error: [NotFoundError, InternalError],
      },
    ),
  ) {}
```

# `server/modules/{{ inputs.name | kebab }}/service.ts`

```typescript
import { Database } from '@server/db'
import { {{ inputs.name | camel | plur }} } from '@server/db/schema'
import {
  toPaginatedResponse,
  withPagination,
} from '@server/lib/pagination'
import { InternalError, NotFoundError } from '@shared/api/errors'
import type {
  {{ inputs.name | pascal }}CreateBody,
  {{ inputs.name | pascal }}ListQuery,
  {{ inputs.name | pascal }}ListResponse,
  {{ inputs.name | pascal }}Response,
  {{ inputs.name | pascal }}UpdateBody,
} from '@shared/api/{{ inputs.name | kebab }}'
import { count, eq, getTableColumns } from 'drizzle-orm'
import { Context, Effect, Layer } from 'effect'

export interface {{ inputs.name | pascal }}ServiceShape {
  readonly list: (
    query: {{ inputs.name | pascal }}ListQuery,
  ) => Effect.Effect<{{ inputs.name | pascal }}ListResponse, InternalError>
  readonly get: (
    id: string,
  ) => Effect.Effect<
    {{ inputs.name | pascal }}Response,
    NotFoundError | InternalError
  >
  readonly create: (
    body: {{ inputs.name | pascal }}CreateBody,
  ) => Effect.Effect<{{ inputs.name | pascal }}Response, InternalError>
  readonly update: (
    id: string,
    body: {{ inputs.name | pascal }}UpdateBody,
  ) => Effect.Effect<
    {{ inputs.name | pascal }}Response,
    NotFoundError | InternalError
  >
  readonly remove: (
    id: string,
  ) => Effect.Effect<
    { readonly success: true },
    NotFoundError | InternalError
  >
}

export class {{ inputs.name | pascal }}Service extends Context.Service<
  {{ inputs.name | pascal }}Service,
  {{ inputs.name | pascal }}ServiceShape
>()(
  '@server/modules/{{ inputs.name | kebab }}/{{ inputs.name | pascal }}Service',
) {
  static readonly Live = Layer.effect(
    {{ inputs.name | pascal }}Service,
    Effect.gen(function* () {
      const database = yield* Database

      const run = <A>(operation: () => Promise<A>) =>
        Effect.tryPromise(operation).pipe(
          Effect.tapError((cause) => Effect.logError(cause)),
          Effect.mapError(() => InternalError.makeInternal()),
        )

      return {
        list: Effect.fn('{{ inputs.name | pascal }}Service.list')(function* (
          query: {{ inputs.name | pascal }}ListQuery,
        ) {
          return yield* run(async () => {
            const selection = database
              .select({
                ...getTableColumns({{ inputs.name | camel | plur }}),
              })
              .from({{ inputs.name | camel | plur }})
            const [data, totals] = await Promise.all([
              withPagination(selection.$dynamic(), query),
              database
                .select({ total: count() })
                .from({{ inputs.name | camel | plur }}),
            ])
            return toPaginatedResponse(data, {
              page: query.page,
              perPage: query.perPage,
              total: totals[0]?.total ?? 0,
            })
          })
        }),
        get: Effect.fn('{{ inputs.name | pascal }}Service.get')(function* (
          id: string,
        ) {
          const data = yield* run(() =>
            database
              .select({
                ...getTableColumns({{ inputs.name | camel | plur }}),
              })
              .from({{ inputs.name | camel | plur }})
              .where(eq({{ inputs.name | camel | plur }}.id, id)),
          )
          if (!data[0]) {
            return yield* Effect.fail(
              NotFoundError.makeNotFound(
                '{{ inputs.name | pascal }} with id ' + id + ' not found',
              ),
            )
          }
          return { data: data[0] }
        }),
        create: Effect.fn('{{ inputs.name | pascal }}Service.create')(function* (
          body: {{ inputs.name | pascal }}CreateBody,
        ) {
          const data = yield* run(() =>
            database
              .insert({{ inputs.name | camel | plur }})
              .values(body)
              .returning({
                ...getTableColumns({{ inputs.name | camel | plur }}),
              }),
          )
          if (!data[0]) {
            return yield* Effect.fail(InternalError.makeInternal())
          }
          return { data: data[0] }
        }),
        update: Effect.fn('{{ inputs.name | pascal }}Service.update')(function* (
          id: string,
          body: {{ inputs.name | pascal }}UpdateBody,
        ) {
          const data = yield* run(() =>
            database
              .update({{ inputs.name | camel | plur }})
              .set(body)
              .where(eq({{ inputs.name | camel | plur }}.id, id))
              .returning({
                ...getTableColumns({{ inputs.name | camel | plur }}),
              }),
          )
          if (!data[0]) {
            return yield* Effect.fail(
              NotFoundError.makeNotFound(
                '{{ inputs.name | pascal }} with id ' + id + ' not found',
              ),
            )
          }
          return { data: data[0] }
        }),
        remove: Effect.fn('{{ inputs.name | pascal }}Service.remove')(function* (
          id: string,
        ) {
          const data = yield* run(() =>
            database
              .delete({{ inputs.name | camel | plur }})
              .where(eq({{ inputs.name | camel | plur }}.id, id))
              .returning({
                id: {{ inputs.name | camel | plur }}.id,
              }),
          )
          if (!data[0]) {
            return yield* Effect.fail(
              NotFoundError.makeNotFound(
                '{{ inputs.name | pascal }} with id ' + id + ' not found',
              ),
            )
          }
          return { success: true as const }
        }),
      } satisfies {{ inputs.name | pascal }}ServiceShape
    }),
  )
}

export const {{ inputs.name | pascal }}ServiceLive = {{ inputs.name | pascal }}Service.Live
```

# `server/modules/{{ inputs.name | kebab }}/handlers.ts`

```typescript
import { Effect } from 'effect'
import { HttpApiBuilder } from 'effect/unstable/httpapi'
import { AppApi } from '@shared/api'
import { {{ inputs.name | pascal }}Service } from './service'

export const {{ inputs.name | pascal }}HandlersLive =
  HttpApiBuilder.group(
    AppApi,
    '{{ inputs.name | camel | plur }}',
    Effect.fn('{{ inputs.name | pascal }}Handlers')(function* (handlers) {
      const service = yield* {{ inputs.name | pascal }}Service
      return handlers
        .handle(
          'get{{ inputs.name | plur | pascal }}',
          ({ query }) => service.list(query),
        )
        .handle('get{{ inputs.name | pascal }}', ({ params }) =>
          service.get(params.id),
        )
        .handle('create{{ inputs.name | pascal }}', ({ payload }) =>
          service.create(payload),
        )
        .handle('update{{ inputs.name | pascal }}', ({ params, payload }) =>
          service.update(params.id, payload),
        )
        .handle('delete{{ inputs.name | pascal }}', ({ params }) =>
          service.remove(params.id),
        )
    }),
  )
```

# `server/modules/{{ inputs.name | kebab }}/service.test.ts`

```typescript
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  {{ inputs.name | pascal }}Service,
  type {{ inputs.name | pascal }}ServiceShape,
} from './service'

const item = {
  id: '{{ inputs.name | kebab }}_1',
  name: '{{ inputs.name | pascal }}',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
}

const {{ inputs.name | pascal }}ServiceTest = Layer.succeed(
  {{ inputs.name | pascal }}Service,
  {
    list: ({ page, perPage }) =>
      Effect.succeed({
        data: [item],
        meta: {
          page,
          perPage,
          total: 1,
          totalPages: 1,
        },
      }),
    get: () => Effect.succeed({ data: item }),
    create: (body) =>
      Effect.succeed({ data: { ...item, ...body } }),
    update: (_id, body) =>
      Effect.succeed({ data: { ...item, ...body } }),
    remove: () => Effect.succeed({ success: true as const }),
  } satisfies {{ inputs.name | pascal }}ServiceShape,
)

describe('{{ inputs.name | pascal }}Service', () => {
  it('runs through the service tag', async () => {
    const program = Effect.gen(function* () {
      const service = yield* {{ inputs.name | pascal }}Service
      return yield* service.list({ page: 1, perPage: 10 })
    }).pipe(Effect.provide({{ inputs.name | pascal }}ServiceTest))

    const result = await Effect.runPromise(program)

    expect(result.data).toEqual([item])
  })
})
```

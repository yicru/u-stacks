---
name: 'module'
root: '.'
output: '**/*'
questions:
  name: 'Please enter a module name.'
---

# `shared/api/{{ inputs.name | kebab }}.ts`

```typescript
import {
  HttpApiEndpoint,
  HttpApiGroup,
} from '@effect/platform'
import { Schema } from 'effect'
import { ApiError } from './errors'
import { PaginationMeta, PaginationQuery } from './pagination'

export const {{ inputs.name | pascal }} = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  createdAt: Schema.DateFromString,
  updatedAt: Schema.DateFromString,
})
export type {{ inputs.name | pascal }} = Schema.Schema.Type<
  typeof {{ inputs.name | pascal }}
>

export const {{ inputs.name | pascal }}ListQuery = PaginationQuery
export type {{ inputs.name | pascal }}ListQuery = Schema.Schema.Type<
  typeof {{ inputs.name | pascal }}ListQuery
>

export const {{ inputs.name | pascal }}ListResponse = Schema.Struct({
  data: Schema.Array({{ inputs.name | pascal }}),
  meta: PaginationMeta,
})
export type {{ inputs.name | pascal }}ListResponse = Schema.Schema.Type<
  typeof {{ inputs.name | pascal }}ListResponse
>

export const {{ inputs.name | pascal }}Path = Schema.Struct({
  id: Schema.String.pipe(Schema.minLength(1)),
})

export const {{ inputs.name | pascal }}CreateBody = Schema.Struct({
  name: Schema.String.pipe(Schema.minLength(1)),
})
export type {{ inputs.name | pascal }}CreateBody = Schema.Schema.Type<
  typeof {{ inputs.name | pascal }}CreateBody
>

export const {{ inputs.name | pascal }}UpdateBody = Schema.Struct({
  name: Schema.optional(
    Schema.String.pipe(Schema.minLength(1)),
  ),
})
export type {{ inputs.name | pascal }}UpdateBody = Schema.Schema.Type<
  typeof {{ inputs.name | pascal }}UpdateBody
>

export const {{ inputs.name | pascal }}Response = Schema.Struct({
  data: {{ inputs.name | pascal }},
})
export type {{ inputs.name | pascal }}Response = Schema.Schema.Type<
  typeof {{ inputs.name | pascal }}Response
>

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
    )
      .setUrlParams({{ inputs.name | pascal }}ListQuery)
      .addSuccess({{ inputs.name | pascal }}ListResponse)
      .addError(ApiError.Internal, { status: 500 }),
  )
  .add(
    HttpApiEndpoint.get(
      'get{{ inputs.name | pascal }}',
      '/{{ inputs.name | kebab | plur }}/:id',
    )
      .setPath({{ inputs.name | pascal }}Path)
      .addSuccess({{ inputs.name | pascal }}Response)
      .addError(ApiError.NotFound, { status: 404 })
      .addError(ApiError.Internal, { status: 500 }),
  )
  .add(
    HttpApiEndpoint.post(
      'create{{ inputs.name | pascal }}',
      '/{{ inputs.name | kebab | plur }}',
    )
      .setPayload({{ inputs.name | pascal }}CreateBody)
      .addSuccess({{ inputs.name | pascal }}Response, { status: 201 })
      .addError(ApiError.Internal, { status: 500 }),
  )
  .add(
    HttpApiEndpoint.put(
      'update{{ inputs.name | pascal }}',
      '/{{ inputs.name | kebab | plur }}/:id',
    )
      .setPath({{ inputs.name | pascal }}Path)
      .setPayload({{ inputs.name | pascal }}UpdateBody)
      .addSuccess({{ inputs.name | pascal }}Response)
      .addError(ApiError.NotFound, { status: 404 })
      .addError(ApiError.Internal, { status: 500 }),
  )
  .add(
    HttpApiEndpoint.del(
      'delete{{ inputs.name | pascal }}',
      '/{{ inputs.name | kebab | plur }}/:id',
    )
      .setPath({{ inputs.name | pascal }}Path)
      .addSuccess({{ inputs.name | pascal }}DeleteResponse)
      .addError(ApiError.NotFound, { status: 404 })
      .addError(ApiError.Internal, { status: 500 }),
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
import { ApiError } from '@shared/api/errors'
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
  ) => Effect.Effect<
    {{ inputs.name | pascal }}ListResponse,
    ApiError.Internal
  >
  readonly get: (
    id: string,
  ) => Effect.Effect<
    {{ inputs.name | pascal }}Response,
    ApiError.NotFound | ApiError.Internal
  >
  readonly create: (
    body: {{ inputs.name | pascal }}CreateBody,
  ) => Effect.Effect<
    {{ inputs.name | pascal }}Response,
    ApiError.Internal
  >
  readonly update: (
    id: string,
    body: {{ inputs.name | pascal }}UpdateBody,
  ) => Effect.Effect<
    {{ inputs.name | pascal }}Response,
    ApiError.NotFound | ApiError.Internal
  >
  readonly remove: (
    id: string,
  ) => Effect.Effect<
    { readonly success: true },
    ApiError.NotFound | ApiError.Internal
  >
}

export class {{ inputs.name | pascal }}Service extends Context.Tag(
  '@server/modules/{{ inputs.name | kebab }}/{{ inputs.name | pascal }}Service',
)<{{ inputs.name | pascal }}Service, {{ inputs.name | pascal }}ServiceShape>() {}

export const {{ inputs.name | pascal }}ServiceLive = Layer.effect(
  {{ inputs.name | pascal }}Service,
  Effect.gen(function* () {
    const database = yield* Database
    const run = <A>(operation: () => Promise<A>) =>
      Effect.tryPromise(operation).pipe(
        Effect.tapError((cause) => Effect.logError(cause)),
        Effect.mapError(() => ApiError.internal()),
      )

    return {
      list: (query) =>
        run(async () => {
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
        }),
      get: (id) =>
        run(() =>
          database
            .select({
              ...getTableColumns({{ inputs.name | camel | plur }}),
            })
            .from({{ inputs.name | camel | plur }})
            .where(eq({{ inputs.name | camel | plur }}.id, id)),
        ).pipe(
          Effect.flatMap((data) =>
            data[0]
              ? Effect.succeed({ data: data[0] })
              : Effect.fail(
                  ApiError.notFound(
                    '{{ inputs.name | pascal }} with id ' +
                      id +
                      ' not found',
                  ),
                ),
          ),
        ),
      create: (body) =>
        run(() =>
          database
            .insert({{ inputs.name | camel | plur }})
            .values(body)
            .returning({
              ...getTableColumns({{ inputs.name | camel | plur }}),
            }),
        ).pipe(
          Effect.flatMap((data) =>
            data[0]
              ? Effect.succeed({ data: data[0] })
              : Effect.fail(ApiError.internal()),
          ),
        ),
      update: (id, body) =>
        run(() =>
          database
            .update({{ inputs.name | camel | plur }})
            .set(body)
            .where(eq({{ inputs.name | camel | plur }}.id, id))
            .returning({
              ...getTableColumns({{ inputs.name | camel | plur }}),
            }),
        ).pipe(
          Effect.flatMap((data) =>
            data[0]
              ? Effect.succeed({ data: data[0] })
              : Effect.fail(
                  ApiError.notFound(
                    '{{ inputs.name | pascal }} with id ' +
                      id +
                      ' not found',
                  ),
                ),
          ),
        ),
      remove: (id) =>
        run(() =>
          database
            .delete({{ inputs.name | camel | plur }})
            .where(eq({{ inputs.name | camel | plur }}.id, id))
            .returning({
              id: {{ inputs.name | camel | plur }}.id,
            }),
        ).pipe(
          Effect.flatMap((data) =>
            data[0]
              ? Effect.succeed({ success: true as const })
              : Effect.fail(
                  ApiError.notFound(
                    '{{ inputs.name | pascal }} with id ' +
                      id +
                      ' not found',
                  ),
                ),
          ),
        ),
    } satisfies {{ inputs.name | pascal }}ServiceShape
  }),
)
```

# `server/modules/{{ inputs.name | kebab }}/handlers.ts`

```typescript
import { HttpApiBuilder } from '@effect/platform'
import { Effect } from 'effect'
import { ShadowApi } from '@shared/api'
import { {{ inputs.name | pascal }}Service } from './service'

export const {{ inputs.name | pascal }}HandlersLive =
  HttpApiBuilder.group(
    ShadowApi,
    '{{ inputs.name | camel | plur }}',
    (handlers) =>
      handlers
        .handle(
          'get{{ inputs.name | plur | pascal }}',
          ({ urlParams }) =>
            Effect.flatMap(
              {{ inputs.name | pascal }}Service,
              (service) => service.list(urlParams),
            ),
        )
        .handle('get{{ inputs.name | pascal }}', ({ path }) =>
          Effect.flatMap(
            {{ inputs.name | pascal }}Service,
            (service) => service.get(path.id),
          ),
        )
        .handle('create{{ inputs.name | pascal }}', ({ payload }) =>
          Effect.flatMap(
            {{ inputs.name | pascal }}Service,
            (service) => service.create(payload),
          ),
        )
        .handle('update{{ inputs.name | pascal }}', ({ path, payload }) =>
          Effect.flatMap(
            {{ inputs.name | pascal }}Service,
            (service) => service.update(path.id, payload),
          ),
        )
        .handle('delete{{ inputs.name | pascal }}', ({ path }) =>
          Effect.flatMap(
            {{ inputs.name | pascal }}Service,
            (service) => service.remove(path.id),
          ),
        ),
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
    remove: () => Effect.succeed({ success: true }),
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

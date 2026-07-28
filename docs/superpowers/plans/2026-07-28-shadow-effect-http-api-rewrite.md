# Shadow Effect HTTP API Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shadowスタックのバックエンド、API contract、browser clientをHonoからEffect HTTP APIへ全面移行し、既存のHTTP contractと画面動作を維持する。

**Architecture:** `shared/api`へEffect Schemaと`AppApi` contractを配置し、serverとbrowserが同じruntime valueを参照する。ServerはDatabase、TaskService、HttpApi handlerをLayerで合成し、TanStack Startへ標準Web handlerを渡す。Browserは`HttpApiClient.make`で生成したclientを`Effect.runPromise`から実行する。

**Tech Stack:** TypeScript 6、Effect 3.21、`@effect/platform` 0.97、TanStack Start、Cloudflare Workers、Drizzle ORM、Turso/libSQL、Vitest、Bun

## Global Constraints

- 既存のURL、HTTP status、JSON envelope、Task画面の表示と操作を維持する。
- Honoとの併存期間を設けない。
- `effect`と`@effect/platform`だけをEffect移行用dependencyとして追加する。
- `hono`、`@hono/zod-validator`、`drizzle-zod`を削除する。
- frontend form validationが使用する`zod`は残す。
- `@libsql/client`は`0.15.15`のpinを維持する。
- `src`から`server`をruntime importしない。
- `as any`、`@ts-ignore`、`@ts-expect-error`を追加しない。
- production codeへcommentを追加しない。
- `worker-configuration.d.ts`と`src/routeTree.gen.ts`を手動編集しない。
- package managerとcommandはBunを使用する。
- 各behaviorは失敗test、RED確認、最小実装、GREEN確認、refactorの順で実装する。

---

### Task 1: Shared Schemaとerror contract

**Files:**
- Modify: `shadow/package.json`
- Modify: `shadow/bun.lock`
- Modify: `shadow/tsconfig.json`
- Create: `shadow/shared/api/errors.ts`
- Create: `shadow/shared/api/health-check.ts`
- Create: `shadow/shared/api/task.ts`
- Test: `shadow/shared/api/task.test.ts`

**Interfaces:**
- Consumes: `effect/Schema`
- Produces: `ApiError.validation`, `ApiError.notFound`, `ApiError.internal`
- Produces: `HealthCheckResponse`
- Produces: `Task`, `TaskListQuery`, `TaskListResponse`, `TaskCreateBody`, `TaskResponse`, `TaskUpdateBody`, `TaskDeleteResponse`
- Produces: `@shared/*` path alias

- [ ] **Step 1: Effect dependencyを追加する**

Run:

```bash
cd shadow
bun add effect@^3.21.4 @effect/platform@^0.97.0
```

Expected: `package.json`と`bun.lock`へ互換性のあるEffect packageが追加され、既存dependencyはまだ削除されない。

- [ ] **Step 2: shared path aliasを追加する**

`shadow/tsconfig.json`の`compilerOptions.paths`を次の形へ変更する。

```json
{
  "paths": {
    "@/*": ["./src/*"],
    "@server/*": ["./server/*"],
    "@shared/*": ["./shared/*"]
  }
}
```

- [ ] **Step 3: Shared Schemaの失敗testを書く**

`shadow/shared/api/task.test.ts`を作成する。

```typescript
import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  Task,
  TaskCreateBody,
  TaskListQuery,
  TaskUpdateBody,
} from './task'

describe('TaskListQuery', () => {
  it('uses the existing pagination defaults', () => {
    expect(Schema.decodeUnknownSync(TaskListQuery)({})).toEqual({
      page: 1,
      perPage: 10,
    })
  })

  it('decodes valid query strings', () => {
    expect(
      Schema.decodeUnknownSync(TaskListQuery)({
        page: '2',
        perPage: '25',
      }),
    ).toEqual({ page: 2, perPage: 25 })
  })

  it('rejects pagination outside the accepted range', () => {
    expect(
      Schema.decodeUnknownEither(TaskListQuery)({
        page: '0',
        perPage: '51',
      })._tag,
    ).toBe('Left')
  })
})

describe('Task payloads', () => {
  it('requires a non-empty title when creating a task', () => {
    expect(
      Schema.decodeUnknownEither(TaskCreateBody)({ title: '' })._tag,
    ).toBe('Left')
  })

  it('accepts an empty update body for compatibility', () => {
    expect(Schema.decodeUnknownSync(TaskUpdateBody)({})).toEqual({})
  })
})

describe('Task', () => {
  it('encodes dates as ISO strings', () => {
    const encoded = Schema.encodeSync(Task)({
      id: 'task_1',
      title: 'Write tests',
      done: false,
      createdAt: new Date('2026-07-28T00:00:00.000Z'),
      updatedAt: new Date('2026-07-28T01:00:00.000Z'),
    })

    expect(encoded.createdAt).toBe('2026-07-28T00:00:00.000Z')
    expect(encoded.updatedAt).toBe('2026-07-28T01:00:00.000Z')
  })
})
```

- [ ] **Step 4: Shared Schema testのREDを確認する**

Run:

```bash
cd shadow
bun run test shared/api/task.test.ts
```

Expected: `Cannot find module './task'`でFAILする。

- [ ] **Step 5: error contractを実装する**

`shadow/shared/api/errors.ts`を作成する。

```typescript
import { Schema } from 'effect'

export namespace ApiError {
  export const Validation = Schema.Struct({
    code: Schema.Literal('VALIDATION_ERROR'),
    message: Schema.String,
    detail: Schema.Array(Schema.Unknown),
  })
  export type Validation = Schema.Schema.Type<typeof Validation>

  export const NotFound = Schema.Struct({
    code: Schema.Literal('NOT_FOUND'),
    message: Schema.String,
  })
  export type NotFound = Schema.Schema.Type<typeof NotFound>

  export const Internal = Schema.Struct({
    code: Schema.Literal('INTERNAL_ERROR'),
    message: Schema.String,
  })
  export type Internal = Schema.Schema.Type<typeof Internal>

  export const validation = (
    detail: ReadonlyArray<unknown>,
  ): Validation => ({
    code: 'VALIDATION_ERROR',
    message: 'Validation Error',
    detail,
  })

  export const notFound = (message: string): NotFound => ({
    code: 'NOT_FOUND',
    message,
  })

  export const internal = (): Internal => ({
    code: 'INTERNAL_ERROR',
    message: 'Internal Server Error',
  })
}
```

- [ ] **Step 6: Health Check Schemaを実装する**

`shadow/shared/api/health-check.ts`を作成する。

```typescript
import { Schema } from 'effect'

export const HealthCheckResponse = Schema.Struct({
  message: Schema.Literal('ok'),
})

export type HealthCheckResponse = Schema.Schema.Type<
  typeof HealthCheckResponse
>
```

- [ ] **Step 7: Task Schemaを実装する**

`shadow/shared/api/task.ts`を作成する。

```typescript
import { Schema } from 'effect'

const Page = Schema.NumberFromString.pipe(
  Schema.int(),
  Schema.greaterThanOrEqualTo(1),
)

const PerPage = Schema.NumberFromString.pipe(
  Schema.int(),
  Schema.between(1, 50),
)

export const Task = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  done: Schema.Boolean,
  createdAt: Schema.DateFromString,
  updatedAt: Schema.DateFromString,
})
export type Task = Schema.Schema.Type<typeof Task>

export const TaskListQuery = Schema.Struct({
  page: Schema.optionalWith(Page, { default: () => 1 }),
  perPage: Schema.optionalWith(PerPage, { default: () => 10 }),
})
export type TaskListQuery = Schema.Schema.Type<typeof TaskListQuery>

export const PaginationMeta = Schema.Struct({
  page: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1)),
  perPage: Schema.Number.pipe(
    Schema.int(),
    Schema.between(1, 50),
  ),
  total: Schema.NonNegativeInt,
  totalPages: Schema.NonNegativeInt,
})
export type PaginationMeta = Schema.Schema.Type<typeof PaginationMeta>

export const TaskListResponse = Schema.Struct({
  data: Schema.Array(Task),
  meta: PaginationMeta,
})
export type TaskListResponse = Schema.Schema.Type<
  typeof TaskListResponse
>

export const TaskPath = Schema.Struct({
  id: Schema.String.pipe(Schema.minLength(1)),
})
export type TaskPath = Schema.Schema.Type<typeof TaskPath>

export const TaskCreateBody = Schema.Struct({
  title: Schema.String.pipe(Schema.minLength(1)),
  done: Schema.optional(Schema.Boolean),
})
export type TaskCreateBody = Schema.Schema.Type<typeof TaskCreateBody>

export const TaskUpdateBody = Schema.Struct({
  title: Schema.optional(
    Schema.String.pipe(Schema.minLength(1)),
  ),
  done: Schema.optional(Schema.Boolean),
})
export type TaskUpdateBody = Schema.Schema.Type<typeof TaskUpdateBody>

export const TaskResponse = Schema.Struct({ data: Task })
export type TaskResponse = Schema.Schema.Type<typeof TaskResponse>

export const TaskDeleteResponse = Schema.Struct({
  success: Schema.Literal(true),
})
export type TaskDeleteResponse = Schema.Schema.Type<
  typeof TaskDeleteResponse
>
```

- [ ] **Step 8: Shared Schema testをGREENにする**

Run:

```bash
cd shadow
bun run test shared/api/task.test.ts
```

Expected: 6 testsがPASSする。

- [ ] **Step 9: typecheckを実行する**

Run:

```bash
cd shadow
bunx tsc -p tsconfig.check.json --noEmit
```

Expected: shared Schemaとpath aliasに型errorがない。

- [ ] **Step 10: Task 1をcommitする**

```bash
git add shadow/package.json shadow/bun.lock shadow/tsconfig.json shadow/shared/api
git commit -m "feat(shadow): add Effect API schemas"
```

### Task 2: Effect HTTP API contract

**Files:**
- Create: `shadow/shared/api/index.ts`
- Test: `shadow/shared/api/index.test.ts`

**Interfaces:**
- Consumes: Task 1のSchemaと`ApiError`
- Produces: `HealthCheckApi`, `TaskApi`, `AppApi`
- Produces endpoint names: `healthCheck.check`, `tasks.list`, `tasks.get`, `tasks.create`, `tasks.update`, `tasks.remove`

- [ ] **Step 1: API metadataの失敗testを書く**

`shadow/shared/api/index.test.ts`を作成する。

```typescript
import { describe, expect, it } from 'vitest'
import { AppApi } from './index'

describe('AppApi', () => {
  it('declares the health check and task groups', () => {
    expect(Object.keys(AppApi.groups)).toEqual([
      'healthCheck',
      'tasks',
    ])
  })

  it('declares every existing task operation', () => {
    expect(Object.keys(AppApi.groups.tasks.endpoints)).toEqual([
      'list',
      'get',
      'create',
      'update',
      'remove',
    ])
  })

  it('keeps the existing methods and paths', () => {
    const endpoints = AppApi.groups.tasks.endpoints

    expect([endpoints.list.method, endpoints.list.path]).toEqual([
      'GET',
      '/api/tasks',
    ])
    expect([endpoints.create.method, endpoints.create.path]).toEqual([
      'POST',
      '/api/tasks',
    ])
    expect([endpoints.update.method, endpoints.update.path]).toEqual([
      'PUT',
      '/api/tasks/:id',
    ])
    expect([endpoints.remove.method, endpoints.remove.path]).toEqual([
      'DELETE',
      '/api/tasks/:id',
    ])
  })
})
```

- [ ] **Step 2: API metadata testのREDを確認する**

Run:

```bash
cd shadow
bun run test shared/api/index.test.ts
```

Expected: `Cannot find module './index'`でFAILする。

- [ ] **Step 3: API contractを実装する**

`shadow/shared/api/index.ts`を作成する。

```typescript
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
} from '@effect/platform'
import { ApiError } from './errors'
import { HealthCheckResponse } from './health-check'
import {
  TaskCreateBody,
  TaskDeleteResponse,
  TaskListQuery,
  TaskListResponse,
  TaskPath,
  TaskResponse,
  TaskUpdateBody,
} from './task'

export class HealthCheckApi extends HttpApiGroup.make(
  'healthCheck',
).add(
  HttpApiEndpoint.get('check', '/health-check').addSuccess(
    HealthCheckResponse,
  ),
) {}

export class TaskApi extends HttpApiGroup.make('tasks')
  .add(
    HttpApiEndpoint.get('list', '/tasks')
      .setUrlParams(TaskListQuery)
      .addSuccess(TaskListResponse)
      .addError(ApiError.Internal, { status: 500 }),
  )
  .add(
    HttpApiEndpoint.get('get', '/tasks/:id')
      .setPath(TaskPath)
      .addSuccess(TaskResponse)
      .addError(ApiError.NotFound, { status: 404 })
      .addError(ApiError.Internal, { status: 500 }),
  )
  .add(
    HttpApiEndpoint.post('create', '/tasks')
      .setPayload(TaskCreateBody)
      .addSuccess(TaskResponse, { status: 201 })
      .addError(ApiError.Internal, { status: 500 }),
  )
  .add(
    HttpApiEndpoint.put('update', '/tasks/:id')
      .setPath(TaskPath)
      .setPayload(TaskUpdateBody)
      .addSuccess(TaskResponse)
      .addError(ApiError.NotFound, { status: 404 })
      .addError(ApiError.Internal, { status: 500 }),
  )
  .add(
    HttpApiEndpoint.del('remove', '/tasks/:id')
      .setPath(TaskPath)
      .addSuccess(TaskDeleteResponse)
      .addError(ApiError.NotFound, { status: 404 })
      .addError(ApiError.Internal, { status: 500 }),
  ) {}

export class AppApi extends HttpApi.make('app')
  .add(HealthCheckApi)
  .add(TaskApi)
  .addError(ApiError.Validation, { status: 400 })
  .prefix('/api') {}
```

- [ ] **Step 4: API metadata testを実行してprefix表現を確認する**

Run:

```bash
cd shadow
bun run test shared/api/index.test.ts
```

Expected: 3 testsがPASSする。

- [ ] **Step 5: Task 2をcommitする**

```bash
git add shadow/shared/api/index.ts shadow/shared/api/index.test.ts
git commit -m "feat(shadow): define Effect HTTP API contract"
```

### Task 3: Database serviceとTaskService Layer

**Files:**
- Modify: `shadow/server/db/index.ts`
- Create: `shadow/server/db/live.ts`
- Rewrite: `shadow/server/lib/pagination.ts`
- Rewrite: `shadow/server/modules/task/service.ts`
- Test: `shadow/server/modules/task/service.test.ts`

**Interfaces:**
- Consumes: `TaskListQuery`, `TaskCreateBody`, `TaskUpdateBody`,`ApiError`
- Produces: `Database` service with `DatabaseClient`
- Produces: `DatabaseLive`
- Produces: `TaskService` with `list`, `get`, `create`, `update`, `remove`
- Produces: `TaskServiceLive`

- [ ] **Step 1: TaskService behaviorの失敗testを書く**

`shadow/server/modules/task/service.test.ts`を作成する。

```typescript
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { Effect, Layer } from 'effect'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@server/db/schema'
import { Database } from '@server/db'
import { TaskService, TaskServiceLive } from './service'

describe('TaskService', () => {
  let close: () => void
  let TestLive: Layer.Layer<TaskService>

  beforeEach(async () => {
    const client = createClient({ url: ':memory:' })
    close = () => client.close()
    await client.execute(`
      CREATE TABLE tasks (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        done INTEGER DEFAULT 0 NOT NULL,
        created_at INTEGER DEFAULT (unixepoch()) NOT NULL,
        updated_at INTEGER DEFAULT (unixepoch()) NOT NULL
      )
    `)
    const database = drizzle(client, { schema })
    TestLive = TaskServiceLive.pipe(
      Layer.provide(Layer.succeed(Database, database)),
    )
  })

  afterEach(() => close())

  it('creates, lists, updates, gets, and removes a task', async () => {
    const program = Effect.gen(function* () {
      const service = yield* TaskService
      const created = yield* service.create({ title: 'Effect API' })
      const listed = yield* service.list({ page: 1, perPage: 10 })
      const updated = yield* service.update(created.data.id, {
        done: true,
      })
      const found = yield* service.get(created.data.id)
      const removed = yield* service.remove(created.data.id)
      return { created, listed, updated, found, removed }
    }).pipe(Effect.provide(TestLive))

    const result = await Effect.runPromise(program)

    expect(result.listed.meta.total).toBe(1)
    expect(result.updated.data.done).toBe(true)
    expect(result.found.data.id).toBe(result.created.data.id)
    expect(result.removed).toEqual({ success: true })
  })

  it('fails with NOT_FOUND for a missing task', async () => {
    const exit = await Effect.runPromiseExit(
      Effect.flatMap(TaskService, (service) =>
        service.get('missing'),
      ).pipe(Effect.provide(TestLive)),
    )

    expect(exit._tag).toBe('Failure')
    if (exit._tag === 'Failure') {
      expect(String(exit.cause)).toContain('NOT_FOUND')
    }
  })

  it('maps a database rejection to INTERNAL_ERROR', async () => {
    close()
    close = () => undefined

    const exit = await Effect.runPromiseExit(
      Effect.flatMap(TaskService, (service) =>
        service.list({ page: 1, perPage: 10 }),
      ).pipe(Effect.provide(TestLive)),
    )

    expect(exit._tag).toBe('Failure')
    if (exit._tag === 'Failure') {
      expect(String(exit.cause)).toContain('INTERNAL_ERROR')
    }
  })
})
```

- [ ] **Step 2: TaskService testのREDを確認する**

Run:

```bash
cd shadow
bun run test server/modules/task/service.test.ts
```

Expected: `Database`または`TaskService` exportが存在せずFAILする。

- [ ] **Step 3: Database serviceを実装する**

`shadow/server/db/index.ts`を次の内容へ置き換える。

```typescript
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { Context } from 'effect'
import * as schema from './schema'

export type DatabaseClient = LibSQLDatabase<typeof schema>

export class Database extends Context.Tag('@server/db/Database')<
  Database,
  DatabaseClient
>() {}
```

- [ ] **Step 4: DatabaseLiveを実装する**

`shadow/server/db/live.ts`を作成する。

```typescript
import { createClient } from '@libsql/client'
import { env } from 'cloudflare:workers'
import { drizzle } from 'drizzle-orm/libsql'
import { Effect, Layer } from 'effect'
import { Database } from './index'
import * as schema from './schema'

export const DatabaseLive = Layer.scoped(
  Database,
  Effect.acquireRelease(
    Effect.sync(() => {
      const client = createClient({
        url: env.TURSO_DATABASE_URL,
        authToken: env.TURSO_AUTH_TOKEN,
      })
      return {
        client,
        database: drizzle(client, { schema }),
      }
    }),
    ({ client }) => Effect.sync(() => client.close()),
  ).pipe(Effect.map(({ database }) => database)),
)
```

- [ ] **Step 5: TaskServiceをEffect serviceへ書き換える**

`shadow/server/lib/pagination.ts`からZod importと`paginationMetaSchema`を削除し、shared typeを使用する。

```typescript
import type { PaginationMeta } from '@shared/api/task'
import type { SQL } from 'drizzle-orm'
import type { SQLiteColumn, SQLiteSelect } from 'drizzle-orm/sqlite-core'

export function withPagination<T extends SQLiteSelect>(
  qb: T,
  params: {
    page: number
    perPage: number
    orderByColumn?: SQLiteColumn | SQL
  },
) {
  if (params.orderByColumn) {
    qb.orderBy(params.orderByColumn)
  }
  return qb.limit(params.perPage).offset(
    (params.page - 1) * params.perPage,
  )
}

export function toPaginatedResponse<T>(
  data: T[],
  input: { page: number; perPage: number; total: number },
): { data: T[]; meta: PaginationMeta } {
  return {
    data,
    meta: {
      page: input.page,
      perPage: input.perPage,
      total: input.total,
      totalPages:
        input.total === 0
          ? 0
          : Math.ceil(input.total / input.perPage),
    },
  }
}
```

`shadow/server/modules/task/service.ts`を次のpublic interfaceに合わせて書き換える。

```typescript
import { tasks } from '@server/db/schema'
import { Database } from '@server/db'
import { toPaginatedResponse, withPagination } from '@server/lib/pagination'
import { ApiError } from '@shared/api/errors'
import type {
  TaskCreateBody,
  TaskListQuery,
  TaskListResponse,
  TaskResponse,
  TaskUpdateBody,
} from '@shared/api/task'
import { count, eq, getTableColumns } from 'drizzle-orm'
import { Context, Effect, Layer } from 'effect'

export interface TaskServiceShape {
  readonly list: (
    query: TaskListQuery,
  ) => Effect.Effect<TaskListResponse, ApiError.Internal>
  readonly get: (
    id: string,
  ) => Effect.Effect<
    TaskResponse,
    ApiError.NotFound | ApiError.Internal
  >
  readonly create: (
    body: TaskCreateBody,
  ) => Effect.Effect<TaskResponse, ApiError.Internal>
  readonly update: (
    id: string,
    body: TaskUpdateBody,
  ) => Effect.Effect<
    TaskResponse,
    ApiError.NotFound | ApiError.Internal
  >
  readonly remove: (
    id: string,
  ) => Effect.Effect<
    { readonly success: true },
    ApiError.NotFound | ApiError.Internal
  >
}

export class TaskService extends Context.Tag(
  '@server/modules/task/TaskService',
)<TaskService, TaskServiceShape>() {}

export const TaskServiceLive = Layer.effect(
  TaskService,
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
            .select({ ...getTableColumns(tasks) })
            .from(tasks)
          const [data, totals] = await Promise.all([
            withPagination(selection.$dynamic(), query),
            database.select({ total: count() }).from(tasks),
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
            .select({ ...getTableColumns(tasks) })
            .from(tasks)
            .where(eq(tasks.id, id)),
        ).pipe(
          Effect.flatMap((data) =>
            data[0]
              ? Effect.succeed({ data: data[0] })
              : Effect.fail(
                  ApiError.notFound(`Task with id ${id} not found`),
                ),
          ),
        ),
      create: (body) =>
        run(() =>
          database
            .insert(tasks)
            .values(body)
            .returning({ ...getTableColumns(tasks) }),
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
            .update(tasks)
            .set(body)
            .where(eq(tasks.id, id))
            .returning({ ...getTableColumns(tasks) }),
        ).pipe(
          Effect.flatMap((data) =>
            data[0]
              ? Effect.succeed({ data: data[0] })
              : Effect.fail(
                  ApiError.notFound(`Task with id ${id} not found`),
                ),
          ),
        ),
      remove: (id) =>
        run(() =>
          database
            .delete(tasks)
            .where(eq(tasks.id, id))
            .returning({ id: tasks.id }),
        ).pipe(
          Effect.flatMap((data) =>
            data[0]
              ? Effect.succeed({ success: true as const })
              : Effect.fail(
                  ApiError.notFound(`Task with id ${id} not found`),
                ),
          ),
        ),
    } satisfies TaskServiceShape
  }),
)
```

- [ ] **Step 6: TaskService testをGREENにする**

Run:

```bash
cd shadow
bun run test server/modules/task/service.test.ts
```

Expected: 3 testsがPASSし、実際のin-memory libSQLに対してCRUDとDB failure変換が動作する。

- [ ] **Step 7: Task 3をcommitする**

```bash
git add shadow/server/db shadow/server/lib/pagination.ts shadow/server/modules/task/service.ts shadow/server/modules/task/service.test.ts
git commit -m "feat(shadow): add Effect service layers"
```

### Task 4: Effect Web handlerとHTTP integration

**Files:**
- Create: `shadow/server/modules/health-check/handlers.ts`
- Create: `shadow/server/modules/task/handlers.ts`
- Create: `shadow/server/handler.ts`
- Rewrite: `shadow/server/index.ts`
- Rewrite: `shadow/src/routes/api/$.ts`
- Test: `shadow/server/handler.test.ts`

**Interfaces:**
- Consumes: `AppApi`, `TaskService`, `TaskServiceLive`, `DatabaseLive`
- Produces: `HealthCheckHandlersLive`, `TaskHandlersLive`, `ApiHandlersLive`
- Produces: `makeApiHandler(taskServiceLayer)`
- Produces: `handleApiRequest(request)`

- [ ] **Step 1: HTTP integrationの失敗testを書く**

`shadow/server/handler.test.ts`を作成する。

```typescript
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  TaskService,
  type TaskServiceShape,
} from '@server/modules/task/service'
import { ApiError } from '@shared/api/errors'
import { makeApiHandler } from './handler'

const task = {
  id: 'task_1',
  title: 'Effect API',
  done: false,
  createdAt: new Date('2026-07-28T00:00:00.000Z'),
  updatedAt: new Date('2026-07-28T00:00:00.000Z'),
}

const TaskServiceTest = Layer.succeed(TaskService, {
  list: ({ page, perPage }) =>
    Effect.succeed({
      data: [task],
      meta: { page, perPage, total: 1, totalPages: 1 },
    }),
  get: (id) =>
    id === task.id
      ? Effect.succeed({ data: task })
      : Effect.fail(
          ApiError.notFound(`Task with id ${id} not found`),
        ),
  create: (body) =>
    Effect.succeed({ data: { ...task, ...body } }),
  update: (id, body) =>
    id === task.id
      ? Effect.succeed({ data: { ...task, ...body } })
      : Effect.fail(
          ApiError.notFound(`Task with id ${id} not found`),
        ),
  remove: (id) =>
    id === task.id
      ? Effect.succeed({ success: true })
      : Effect.fail(
          ApiError.notFound(`Task with id ${id} not found`),
        ),
} satisfies TaskServiceShape)

const TaskServiceFailure = Layer.succeed(TaskService, {
  list: () => Effect.fail(ApiError.internal()),
  get: () => Effect.fail(ApiError.internal()),
  create: () => Effect.fail(ApiError.internal()),
  update: () => Effect.fail(ApiError.internal()),
  remove: () => Effect.fail(ApiError.internal()),
} satisfies TaskServiceShape)

describe('Effect API handler', () => {
  const { handler, dispose } = makeApiHandler(TaskServiceTest)

  it('serves the existing health check endpoint', async () => {
    const response = await handler(
      new Request('http://localhost/api/health-check'),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ message: 'ok' })
  })

  it('serves the existing task list contract', async () => {
    const response = await handler(
      new Request(
        'http://localhost/api/tasks?page=2&perPage=25',
      ),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.meta).toEqual({
      page: 2,
      perPage: 25,
      total: 1,
      totalPages: 1,
    })
  })

  it('returns 201 for task creation', async () => {
    const response = await handler(
      new Request('http://localhost/api/tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Created' }),
      }),
    )

    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({
      data: { title: 'Created' },
    })
  })

  it('gets a task by id', async () => {
    const response = await handler(
      new Request('http://localhost/api/tasks/task_1'),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      data: { id: 'task_1' },
    })
  })

  it('updates a task by id', async () => {
    const response = await handler(
      new Request('http://localhost/api/tasks/task_1', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ done: true }),
      }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      data: { id: 'task_1', done: true },
    })
  })

  it('removes a task by id', async () => {
    const response = await handler(
      new Request('http://localhost/api/tasks/task_1', {
        method: 'DELETE',
      }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true })
  })

  it('normalizes request decode failures', async () => {
    const response = await handler(
      new Request('http://localhost/api/tasks?page=0'),
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Validation Error',
    })
    expect(Array.isArray(body.detail)).toBe(true)
  })

  it('returns the existing not found envelope', async () => {
    const response = await handler(
      new Request('http://localhost/api/tasks/missing'),
    )

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      code: 'NOT_FOUND',
      message: 'Task with id missing not found',
    })
  })

  it('normalizes an unknown endpoint', async () => {
    const response = await handler(
      new Request('http://localhost/api/unknown'),
    )

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      code: 'NOT_FOUND',
      message: 'The requested endpoint /api/unknown was not found',
    })
  })

  it('returns the existing internal error envelope', async () => {
    const failureServer = makeApiHandler(TaskServiceFailure)
    const response = await failureServer.handler(
      new Request('http://localhost/api/tasks'),
    )

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Internal Server Error',
    })
    await failureServer.dispose()
  })

  it('disposes the test runtime', async () => {
    await expect(dispose()).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: HTTP integration testのREDを確認する**

Run:

```bash
cd shadow
bun run test server/handler.test.ts
```

Expected: `Cannot find module './handler'`でFAILする。

- [ ] **Step 3: Health Check handler Layerを実装する**

`shadow/server/modules/health-check/handlers.ts`を作成する。

```typescript
import { HttpApiBuilder } from '@effect/platform'
import { Effect } from 'effect'
import { AppApi } from '@shared/api'

export const HealthCheckHandlersLive = HttpApiBuilder.group(
  AppApi,
  'healthCheck',
  (handlers) =>
    handlers.handle('check', () =>
      Effect.succeed({ message: 'ok' as const }),
    ),
)
```

- [ ] **Step 4: Task handler Layerを実装する**

`shadow/server/modules/task/handlers.ts`を作成する。

```typescript
import { HttpApiBuilder } from '@effect/platform'
import { Effect } from 'effect'
import { AppApi } from '@shared/api'
import { TaskService } from './service'

export const TaskHandlersLive = HttpApiBuilder.group(
  AppApi,
  'tasks',
  (handlers) =>
    handlers
      .handle('list', ({ urlParams }) =>
        Effect.flatMap(TaskService, (service) =>
          service.list(urlParams),
        ),
      )
      .handle('get', ({ path }) =>
        Effect.flatMap(TaskService, (service) =>
          service.get(path.id),
        ),
      )
      .handle('create', ({ payload }) =>
        Effect.flatMap(TaskService, (service) =>
          service.create(payload),
        ),
      )
      .handle('update', ({ path, payload }) =>
        Effect.flatMap(TaskService, (service) =>
          service.update(path.id, payload),
        ),
      )
      .handle('remove', ({ path }) =>
        Effect.flatMap(TaskService, (service) =>
          service.remove(path.id),
        ),
      ),
)
```

- [ ] **Step 5: Web handler factoryを実装する**

`shadow/server/handler.ts`へ次の責務を実装する。

```typescript
import {
  HttpApiBuilder,
  HttpServer,
  HttpServerResponse,
} from '@effect/platform'
import { Effect, Layer } from 'effect'
import { AppApi } from '@shared/api'
import { ApiError } from '@shared/api/errors'
import { HealthCheckHandlersLive } from '@server/modules/health-check/handlers'
import { TaskHandlersLive } from '@server/modules/task/handlers'
import { TaskService } from '@server/modules/task/service'

const ApiHandlersLive = Layer.mergeAll(
  HealthCheckHandlersLive,
  TaskHandlersLive,
)

const ErrorMiddlewareLive = HttpApiBuilder.middleware(
  AppApi,
  (httpApp) =>
    httpApp.pipe(
      Effect.catchTag('HttpApiDecodeError', (error) =>
        HttpServerResponse.unsafeJson(
          ApiError.validation(error.issues),
          { status: 400 },
        ),
      ),
    ),
)

export const makeApiHandler = <E>(
  taskServiceLayer: Layer.Layer<TaskService, E, never>,
) => {
  const handlers = ApiHandlersLive.pipe(
    Layer.provide(taskServiceLayer),
  )
  const api = HttpApiBuilder.api(AppApi).pipe(
    Layer.provide(handlers),
  )
  const web = HttpApiBuilder.toWebHandler(
    Layer.mergeAll(
      api,
      ErrorMiddlewareLive,
      HttpServer.layerContext,
    ),
  )

  return {
    dispose: web.dispose,
    handler: async (request: Request) => {
      const response = await web.handler(request)
      if (response.status !== 404) {
        return response
      }
      const body = await response.clone().json().catch(() => undefined)
      if (
        typeof body === 'object' &&
        body !== null &&
        'code' in body
      ) {
        return response
      }
      return Response.json(
        ApiError.notFound(
          `The requested endpoint ${new URL(request.url).pathname} was not found`,
        ),
        { status: 404 },
      )
    },
  }
}
```

- [ ] **Step 6: production handlerを合成する**

`shadow/server/index.ts`を次の内容へ書き換える。

```typescript
import { Layer } from 'effect'
import { DatabaseLive } from '@server/db/live'
import { TaskServiceLive } from '@server/modules/task/service'
import { makeApiHandler } from './handler'

const TaskServiceProduction = TaskServiceLive.pipe(
  Layer.provide(DatabaseLive),
)

export const { dispose, handler } = makeApiHandler(
  TaskServiceProduction,
)
```

- [ ] **Step 7: TanStack Start bridgeをEffect handlerへ切り替える**

`shadow/src/routes/api/$.ts`を次の内容へ書き換える。

```typescript
import { createFileRoute } from '@tanstack/react-router'
import { handler } from '@server/index'

export const Route = createFileRoute('/api/$')({
  server: {
    handlers: {
      GET: ({ request }) => handler(request),
      POST: ({ request }) => handler(request),
      PUT: ({ request }) => handler(request),
      PATCH: ({ request }) => handler(request),
      DELETE: ({ request }) => handler(request),
    },
  },
})
```

- [ ] **Step 8: HTTP integration testをGREENにする**

Run:

```bash
cd shadow
bun run test server/handler.test.ts
```

Expected: 11 testsがPASSする。

- [ ] **Step 9: production Layerをtypecheckする**

Run:

```bash
cd shadow
bunx tsc -p tsconfig.check.json --noEmit
```

Expected: `handler(request)`が`Promise<Response>`としてTanStack Startへ接続され、未解決serviceがない。

- [ ] **Step 10: Task 4をcommitする**

```bash
git add shadow/server shadow/src/routes/api/$.ts
git commit -m "feat(shadow): serve Effect HTTP API"
```

### Task 5: Effect browser clientとTask UI

**Files:**
- Rewrite: `shadow/src/lib/api-client.ts`
- Rewrite: `shadow/src/routes/index.tsx`
- Rewrite: `shadow/src/features/task/components/create-task-form.tsx`
- Rewrite: `shadow/src/features/task/components/task-list.tsx`
- Test: `shadow/src/lib/api-client.test.ts`

**Interfaces:**
- Consumes: `AppApi`, `FetchHttpClient.layer`, `makeApiHandler`
- Produces: `makeApiClient(baseUrl)`
- Produces: `apiClient`
- Produces client methods: `tasks.list`, `tasks.get`, `tasks.create`, `tasks.update`, `tasks.remove`

- [ ] **Step 1: Generated clientの失敗testを書く**

`shadow/src/lib/api-client.test.ts`を作成する。

```typescript
import { FetchHttpClient } from '@effect/platform'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'
import { makeApiHandler } from '@server/handler'
import {
  TaskService,
  type TaskServiceShape,
} from '@server/modules/task/service'
import { ApiError } from '@shared/api/errors'
import { makeApiClient } from './api-client'

const task = {
  id: 'task_1',
  title: 'Generated client',
  done: false,
  createdAt: new Date('2026-07-28T00:00:00.000Z'),
  updatedAt: new Date('2026-07-28T00:00:00.000Z'),
}

const TaskServiceTest = Layer.succeed(TaskService, {
  list: ({ page, perPage }) =>
    Effect.succeed({
      data: [task],
      meta: { page, perPage, total: 1, totalPages: 1 },
    }),
  get: (id) =>
    id === task.id
      ? Effect.succeed({ data: task })
      : Effect.fail(
          ApiError.notFound(`Task with id ${id} not found`),
        ),
  create: (body) =>
    Effect.succeed({ data: { ...task, ...body } }),
  update: (_, body) =>
    Effect.succeed({ data: { ...task, ...body } }),
  remove: () => Effect.succeed({ success: true }),
} satisfies TaskServiceShape)

describe('Effect API client', () => {
  it('calls the real Effect handler through an injected fetch', async () => {
    const server = makeApiHandler(TaskServiceTest)
    const FetchTest = Layer.succeed(
      FetchHttpClient.Fetch,
      (input, init) => server.handler(new Request(input, init)),
    )
    const ClientLive = FetchHttpClient.layer.pipe(
      Layer.provide(FetchTest),
    )

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* makeApiClient('http://localhost')
        return yield* client.tasks.list({ urlParams: {} })
      }).pipe(Effect.provide(ClientLive)),
    )

    expect(result.data[0]).toEqual(task)
    await server.dispose()
  })

  it('calls every generated mutation method', async () => {
    const server = makeApiHandler(TaskServiceTest)
    const FetchTest = Layer.succeed(
      FetchHttpClient.Fetch,
      (input, init) => server.handler(new Request(input, init)),
    )
    const ClientLive = FetchHttpClient.layer.pipe(
      Layer.provide(FetchTest),
    )

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* makeApiClient('http://localhost')
        const created = yield* client.tasks.create({
          payload: { title: 'Created' },
        })
        const updated = yield* client.tasks.update({
          path: { id: task.id },
          payload: { done: true },
        })
        const removed = yield* client.tasks.remove({
          path: { id: task.id },
        })
        return { created, updated, removed }
      }).pipe(Effect.provide(ClientLive)),
    )

    expect(result.created.data.title).toBe('Created')
    expect(result.updated.data.done).toBe(true)
    expect(result.removed).toEqual({ success: true })
    await server.dispose()
  })

  it('decodes a non-success response into a typed failure', async () => {
    const server = makeApiHandler(TaskServiceTest)
    const FetchTest = Layer.succeed(
      FetchHttpClient.Fetch,
      (input, init) => server.handler(new Request(input, init)),
    )
    const ClientLive = FetchHttpClient.layer.pipe(
      Layer.provide(FetchTest),
    )

    const exit = await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* makeApiClient('http://localhost')
        return yield* Effect.exit(
          client.tasks.get({ path: { id: 'missing' } }),
        )
      }).pipe(Effect.provide(ClientLive)),
    )

    expect(exit._tag).toBe('Failure')
    if (exit._tag === 'Failure') {
      expect(String(exit.cause)).toContain('NOT_FOUND')
    }
    await server.dispose()
  })
})
```

- [ ] **Step 2: browser client testのREDを確認する**

Run:

```bash
cd shadow
bun run test src/lib/api-client.test.ts
```

Expected: `makeApiClient`が存在せずFAILする。

- [ ] **Step 3: Effect API clientを実装する**

`shadow/src/lib/api-client.ts`を次の内容へ書き換える。

```typescript
import {
  FetchHttpClient,
  HttpApiClient,
} from '@effect/platform'
import { Effect } from 'effect'
import { AppApi } from '@shared/api'

export const makeApiClient = (baseUrl: string) =>
  HttpApiClient.make(AppApi, { baseUrl })

export const apiClient = Effect.runSync(
  makeApiClient(import.meta.env.VITE_API_URL ?? '').pipe(
    Effect.provide(FetchHttpClient.layer),
  ),
)
```

- [ ] **Step 4: browser client testをGREENにする**

Run:

```bash
cd shadow
bun run test src/lib/api-client.test.ts
```

Expected: 3 testsがPASSし、Date decode、全mutation、typed failureが動作する。

- [ ] **Step 5: index loaderをEffect clientへ移行する**

`shadow/src/routes/index.tsx`のloaderを次の形へ変更する。

```typescript
loader: () =>
  Effect.runPromise(
    apiClient.tasks.list({
      urlParams: {},
    }),
  ),
```

`hono/client` importを削除し、`effect`から`Effect`をimportする。

- [ ] **Step 6: CreateTaskFormをEffect clientへ移行する**

`shadow/src/features/task/components/create-task-form.tsx`のsubmit処理を次の形へ変更する。

```typescript
onSubmit: async ({ value }) => {
  await Effect.runPromise(
    apiClient.tasks
      .create({
        payload: { title: value.title },
      })
      .pipe(
        Effect.tap(() =>
          Effect.promise(() => router.invalidate()),
        ),
        Effect.tap(() =>
          Effect.sync(() => {
            form.reset()
            toast.success('Task created')
          }),
        ),
        Effect.catchAll(() =>
          Effect.sync(() => {
            toast.error('Failed to create task')
          }),
        ),
      ),
  )
},
```

`hono/client` importを削除し、`effect`から`Effect`をimportする。

- [ ] **Step 7: TaskListの型とmutationをEffect clientへ移行する**

`shadow/src/features/task/components/task-list.tsx`ではshared Task型を使用する。

```typescript
import type { Task } from '@shared/api/task'
```

Toggle callを次の形へ変更する。

```typescript
apiClient.tasks
  .update({
    path: { id: task.id },
    payload: { done: !task.done },
  })
  .pipe(
    Effect.tap(() =>
      Effect.promise(() => router.invalidate()),
    ),
    Effect.catchAll(() =>
      Effect.sync(() => {
        toast.error('Failed to update task')
      }),
    ),
    Effect.runPromise,
  )
```

Delete callを次の形へ変更する。

```typescript
apiClient.tasks
  .remove({
    path: { id },
  })
  .pipe(
    Effect.tap(() =>
      Effect.promise(() => router.invalidate()),
    ),
    Effect.tap(() =>
      Effect.sync(() => {
        toast.success('Task deleted')
      }),
    ),
    Effect.catchAll(() =>
      Effect.sync(() => {
        toast.error('Failed to delete task')
      }),
    ),
    Effect.runPromise,
  )
```

`InferResponseType`、`parseResponse`、`hono/client` importを削除する。

- [ ] **Step 8: frontendを検証する**

Run:

```bash
cd shadow
bun run test src/lib/api-client.test.ts
bunx tsc -p tsconfig.check.json --noEmit
```

Expected: client testがPASSし、loaderとTask componentがgenerated clientの型に一致する。

- [ ] **Step 9: Task 5をcommitする**

```bash
git add shadow/src/lib/api-client.ts shadow/src/lib/api-client.test.ts shadow/src/routes/index.tsx shadow/src/features/task
git commit -m "feat(shadow): use Effect HTTP API client"
```

### Task 6: Generator、文書、Hono artifactの削除

**Files:**
- Rewrite: `shadow/.scaffdog/module.md`
- Rewrite: `shadow/server/modules/README.md`
- Rewrite: `shadow/README.md`
- Rewrite: `shadow/AGENTS.md`
- Rewrite: `AGENTS.md`
- Modify: `shadow/package.json`
- Modify: `shadow/bun.lock`
- Delete: `shadow/server/factory.ts`
- Delete: `shadow/server/lib/errors.ts`
- Delete: `shadow/server/lib/validator.ts`
- Delete: `shadow/server/modules/health-check/index.ts`
- Delete: `shadow/server/modules/task/index.ts`
- Delete: `shadow/server/modules/task/model.ts`

**Interfaces:**
- Consumes: Task 1からTask 5の確定構成
- Produces: Effect module generator
- Produces: 移行後のREADMEとknowledge base
- Produces: Hono packageとsource referenceが0件のdependency graph

- [ ] **Step 1: Hono artifact auditのREDを確認する**

Run:

```bash
rg -n -i "hono|zValidator|InferResponseType|parseResponse|drizzle-zod" shadow AGENTS.md
```

Expected: package、source、generator、README、AGENTS.mdに複数の旧参照が表示される。

- [ ] **Step 2: scaffdog controller templateをEffect contractとhandlerへ変更する**

`shadow/.scaffdog/module.md`のCRUD生成物を次の4ファイルへ変更する。

```text
shared/api/{{ name }}.ts
server/modules/{{ name }}/service.ts
server/modules/{{ name }}/handlers.ts
server/modules/{{ name }}/service.test.ts
```

front matterの`root`は`.`へ変更し、shared contractとserver moduleを同じgeneratorから出力できるようにする。

Contract templateは`HttpApiGroup.make`、`HttpApiEndpoint`、Effect Schemaをimportする。

Handler templateは次の形を生成する。

```typescript
export const {{ inputs.name | pascal }}HandlersLive =
  HttpApiBuilder.group(
    AppApi,
    '{{ inputs.name | camel }}',
    (handlers) =>
      handlers.handle('list', ({ urlParams }) =>
        Effect.flatMap(
          {{ inputs.name | pascal }}Service,
          (service) => service.list(urlParams),
        ),
      ),
  )
```

Service templateは`Context.Tag`、service shape、`Layer.effect`を生成し、Hono contextを受け取らない。

- [ ] **Step 3: module design documentを書き換える**

`shadow/server/modules/README.md`へ次の規則を記載する。

- shared contractは`shared/api/{name}.ts`
- handlerは`HttpApiBuilder.group`
- serviceは`Context.Tag`とLive Layer
- request、response、errorはEffect Schema
- browserは`HttpApiClient`を使用
- module登録は`AppApi`とhandler Layerの両方へ追加
- DB operationは`Effect.tryPromise`でtyped errorへ変換

Hono class、router chain、Zod namespaceの説明を削除する。

- [ ] **Step 4: Shadow READMEとAGENTS.mdを更新する**

`shadow/README.md`と`shadow/AGENTS.md`で次の内容を現行化する。

- stack名をTanStack Start + Effect HTTP API + Drizzle + Tursoへ変更
- `shared/api`をcontract配置場所として追加
- `server/handler.ts`をWeb handler factoryとして追加
- `server/db`と`server/modules`のLayer構成を記載
- browser clientを`HttpApiClient`として記載
- Hono RPCと`hc<AppType>`の記載を削除
- module generatorの新しい生成物を記載
- test fileが存在する状態へ説明を変更

- [ ] **Step 5: root AGENTS.mdを更新する**

root `AGENTS.md`のoverview、shared pattern、stack comparisonからShadowのHono記載を外し、Effect HTTP API、Effect Schema、Layer、HttpApiClientへ変更する。

TailsとSonicのHono記載は維持する。

- [ ] **Step 6: 旧source fileを削除する**

次のfileだけを削除する。

```bash
git rm shadow/server/factory.ts
git rm shadow/server/lib/errors.ts
git rm shadow/server/lib/validator.ts
git rm shadow/server/modules/health-check/index.ts
git rm shadow/server/modules/task/index.ts
git rm shadow/server/modules/task/model.ts
```

- [ ] **Step 7: 旧dependencyを削除する**

Run:

```bash
cd shadow
bun remove hono @hono/zod-validator drizzle-zod
```

Expected: `package.json`と`bun.lock`から3 packageが削除され、`zod`と`@libsql/client@0.15.15`は残る。

- [ ] **Step 8: Hono artifact auditをGREENにする**

Run:

```bash
rg -n -i "from 'hono|from \"hono|@hono/zod-validator|drizzle-zod|hc<AppType>|InferResponseType|parseResponse|zValidator" shadow AGENTS.md
```

Expected: 0件でexit code 1になる。

- [ ] **Step 9: backend Zod auditを実行する**

Run:

```bash
rg -n "from ['\"]zod['\"]" shadow/server shadow/shared
```

Expected: 0件でexit code 1になる。

- [ ] **Step 10: 禁止import auditを実行する**

Run:

```bash
rg -n "from ['\"]@server/" shadow/src --glob '!routes/api/$.ts'
```

Expected: 0件でexit code 1になる。

- [ ] **Step 11: Task 6をcommitする**

```bash
git add AGENTS.md shadow
git commit -m "docs(shadow): complete Effect API migration"
```

### Task 7: 全体検証と互換性監査

**Files:**
- Modify only if verification exposes a migration defect

**Interfaces:**
- Consumes: Tasks 1から6の完成状態
- Produces: test、lint、build、static auditの完了証拠

- [ ] **Step 1: formatterを実行する**

Run:

```bash
cd shadow
bun run format
```

Expected: Effect source、test、configがoxlintとoxfmtの規則に従う。

- [ ] **Step 2: 全testを実行する**

Run:

```bash
cd shadow
bun run test
```

Expected: Shared Schema、service、HTTP handler、browser clientの全testがPASSする。

- [ ] **Step 3: lintとtypecheckを実行する**

Run:

```bash
cd shadow
bun run lint
```

Expected: TypeScript、oxlint、oxfmt checkがすべて成功する。

- [ ] **Step 4: production buildを実行する**

Run:

```bash
cd shadow
bun run build
```

Expected: TanStack StartとCloudflare Workers bundleがEffect APIを含んでbuildされる。

- [ ] **Step 5: dependency invariantを確認する**

Run:

```bash
cd shadow
bun pm ls effect @effect/platform @libsql/client hono @hono/zod-validator drizzle-zod
```

Expected:

```text
effect 3.21.x
@effect/platform 0.97.x
@libsql/client 0.15.15
```

Hono関連3 packageはdirect dependencyとして表示されない。

- [ ] **Step 6: source auditを確認する**

Run:

```bash
rg -n -i "from 'hono|from \"hono|@hono/zod-validator|drizzle-zod|hc<AppType>|InferResponseType|parseResponse|zValidator" shadow AGENTS.md
rg -n "from ['\"]zod['\"]" shadow/server shadow/shared
rg -n "from ['\"]@server/" shadow/src --glob '!routes/api/$.ts'
```

Expected: 3 commandが0件でexit code 1になる。

- [ ] **Step 7: API contract test coverageを対応表で確認する**

次のrequirementとtestを照合する。

| Requirement | Evidence |
| --- | --- |
| `/api/health-check` | `server/handler.test.ts` health test |
| Task list queryとdefault | `shared/api/task.test.ts`、handler list test |
| Task create 201 | handler create test |
| Task get、update、delete | handlerのget、update、remove test |
| validation 400 | handler decode failure test |
| Task not found 404 | handler not found test |
| unknown endpoint 404 | handler unknown endpoint test |
| browser typed client | clientのlist、mutation、typed failure test |
| Date wire transform | `shared/api/task.test.ts`、client test |
| Layer差し替え | handlerとclient testの`TaskServiceTest` |

- [ ] **Step 8: final diffを自己レビューする**

Run:

```bash
git diff main...HEAD --check
git diff main...HEAD --stat
git status --short
```

Expected: whitespace errorがなく、意図しないstackやgenerated fileの変更がなく、worktreeがcleanである。

- [ ] **Step 9: verification fixをcommitする**

Verificationで修正が発生した場合だけ実行する。

```bash
git add shadow AGENTS.md
git commit -m "fix(shadow): complete Effect API verification"
```

修正がなければ新しいcommitは作らない。

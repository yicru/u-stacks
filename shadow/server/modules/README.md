# Effect API Module Rules

Shadow のAPIは、共有contract、HTTP handler、service、databaseをEffectの型とLayerで合成する。

## 構成

```text
shared/api/
├── errors.ts
├── index.ts
├── pagination.ts
└── {name}.ts
server/
├── db/
│   ├── index.ts
│   ├── live.ts
│   └── schema.ts
├── modules/{name}/
│   ├── handlers.ts
│   ├── service.ts
│   └── service.test.ts
├── handler.ts
└── index.ts
src/lib/api-client.ts
```

| ファイル                            | 責務                                                  |
| ----------------------------------- | ----------------------------------------------------- |
| `shared/api/pagination.ts`          | module共通のpagination queryとresponse meta           |
| `shared/api/{name}.ts`              | Effect Schemaと`HttpApiGroup`による公開contract       |
| `server/modules/{name}/handlers.ts` | `HttpApiBuilder.group`によるHTTPとserviceの接続       |
| `server/modules/{name}/service.ts`  | `Context.Tag`とLive Layerによるdomain/DB処理          |
| `server/db/index.ts`                | database serviceのTag                                 |
| `server/db/live.ts`                 | Turso/Drizzle resourceを管理するscoped Layer          |
| `server/handler.ts`                 | API、handler、serviceをWeb `Request`/`Response`へ合成 |
| `src/lib/api-client.ts`             | 同じcontractから生成する`HttpApiClient`               |

## Contract

request、response、errorは`shared/api`のEffect Schemaで定義する。型はSchemaから導出し、interfaceとの二重管理をしない。
一覧APIは`shared/api/pagination.ts`の`PaginationQuery`と`PaginationMeta`を再利用する。

```typescript
import { HttpApiEndpoint, HttpApiGroup } from '@effect/platform'
import { Schema } from 'effect'
import { ApiError } from './errors'

export const Project = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
})

export const ProjectCreateBody = Schema.Struct({
  name: Schema.String.pipe(Schema.minLength(1)),
})

export const ProjectResponse = Schema.Struct({
  data: Project,
})

export class ProjectApi extends HttpApiGroup.make('projects').add(
  HttpApiEndpoint.post('create', '/projects')
    .setPayload(ProjectCreateBody)
    .addSuccess(ProjectResponse, { status: 201 })
    .addError(ApiError.Internal, { status: 500 }),
) {}
```

`shared/api/index.ts`の`ShadowApi`へgroupを追加する。すべてのpathは`ShadowApi.prefix('/api')`の配下になる。

## Handler

handlerはrequestをdecode済みの値として受け取り、serviceへ委譲する。HTTP responseの手組みやDB処理を置かない。

```typescript
import { HttpApiBuilder } from '@effect/platform'
import { Effect } from 'effect'
import { ShadowApi } from '@shared/api'
import { ProjectService } from './service'

export const ProjectHandlersLive = HttpApiBuilder.group(
  ShadowApi,
  'projects',
  (handlers) =>
    handlers.handle('create', ({ payload }) =>
      Effect.flatMap(ProjectService, (service) => service.create(payload)),
    ),
)
```

`server/handler.ts`のhandler Layer集合へ追加する。

## Service

serviceの公開interfaceは`Effect.Effect<Success, Error>`を返す。`Context.Tag`で依存を表現し、production実装は`Layer.effect`で構築する。

```typescript
import { Context, Effect, Layer } from 'effect'
import { Database } from '@server/db'
import { ApiError } from '@shared/api/errors'
import type { ProjectResponse } from '@shared/api/project'

export interface ProjectServiceShape {
  readonly get: (
    id: string,
  ) => Effect.Effect<ProjectResponse, ApiError.NotFound | ApiError.Internal>
}

export class ProjectService extends Context.Tag(
  '@server/modules/project/ProjectService',
)<ProjectService, ProjectServiceShape>() {}

export const ProjectServiceLive = Layer.effect(
  ProjectService,
  Effect.gen(function* () {
    const database = yield* Database
    const run = <A>(operation: () => Promise<A>) =>
      Effect.tryPromise(operation).pipe(
        Effect.tapError((cause) => Effect.logError(cause)),
        Effect.mapError(() => ApiError.internal()),
      )

    return {
      get: (id) =>
        run(() =>
          database.query.projects.findFirst({
            where: (projects, { eq }) => eq(projects.id, id),
          }),
        ).pipe(
          Effect.flatMap((data) =>
            data
              ? Effect.succeed({ data })
              : Effect.fail(
                  ApiError.notFound('Project with id ' + id + ' not found'),
                ),
          ),
        ),
    } satisfies ProjectServiceShape
  }),
)
```

DB Promiseの失敗は`Effect.tryPromise`で捕捉し、外部contractのtyped errorへ変換する。未発見は`ApiError.notFound`、予期しないDB失敗は`ApiError.internal`にする。

## 登録

新しいmoduleは次の3箇所へ登録する。

1. `shared/api/index.ts`の`ShadowApi`へAPI groupを追加
2. `server/handler.ts`へhandler Layerを追加し、factoryが受け取るservice Layerの要件を拡張
3. `server/index.ts`でservice Live Layerへ`DatabaseLive`を供給

browserはserver型をimportせず、`src/lib/api-client.ts`の`HttpApiClient`からgroup endpointを呼び出す。

```typescript
await Effect.runPromise(
  apiClient.projects.create({
    payload: { name: 'Shadow' },
  }),
)
```

## テスト

- Schema testでdecode、default、boundary、Date encodeを確認する
- service testではin-memory databaseまたはtest Layerを注入する
- handler testではWeb `Request`/`Response`としてstatusとJSON envelopeを確認する
- client testではquery/payload encode、response/error decodeを確認する

## Generator

```bash
bun run generate:module
```

module名を入力すると次を生成する。

```text
shared/api/{name}.ts
server/modules/{name}/handlers.ts
server/modules/{name}/service.ts
server/modules/{name}/service.test.ts
```

生成後はDB schemaを追加し、上記の3箇所へmoduleを登録してから、migration、test、lintを実行する。

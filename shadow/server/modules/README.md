# Module Rules

[Elysia Best Practice (MVC)](https://elysiajs.com/essential/best-practice) を参考にした Hono の MVC ライクなモジュールパターンに基づくサーバーサイド設計規則。

---

## ディレクトリ構成

```
server/
├── modules/
│   ├── {name}/
│   │   ├── index.ts      # Controller — Hono ルート定義
│   │   ├── service.ts     # Service — ビジネスロジック + DB 操作
│   │   └── model.ts       # Model — Zod スキーマ + 型定義
│   └── README.md
├── db/
│   ├── index.ts           # db — Drizzle + Turso インスタンス
│   └── schema.ts          # Drizzle テーブル定義
├── lib/
│   ├── errors.ts          # ApiError クラス階層
│   ├── validator.ts       # zValidator ラッパー
│   ├── pagination.ts      # ページネーションユーティリティ
│   └── nanoid.ts          # ID 生成
├── factory.ts             # Hono インスタンス生成 + 共通ミドルウェア
└── index.ts               # ルートマウント + AppType export
```

---

## 命名規則

| 対象         | 規則              | 例                                    |
| ------------ | ----------------- | ------------------------------------- |
| ディレクトリ | kebab-case        | `health-check/`, `task/`              |
| ファイル     | kebab-case        | `index.ts`, `service.ts`, `model.ts`  |
| export 名    | PascalCase        | `TaskApp`, `TaskService`, `TaskModel` |
| ルートパス   | kebab-case 複数形 | `/tasks`, `/health-check`             |

---

## スコープルール

各ファイルのトップレベルには **ルート変数 / namespace のみ** を定義する。ヘルパー関数やローカル変数の散在を禁止する。

| ファイル     | 許可されるトップレベル export | 禁止                               |
| ------------ | ----------------------------- | ---------------------------------- |
| `index.ts`   | `XxxApp`（Hono チェーン）     | チェーン外のヘルパー関数・変数     |
| `service.ts` | `XxxService`（オブジェクト）  | オブジェクト外のヘルパー関数・変数 |
| `model.ts`   | `XxxModel`（namespace）       | namespace 外のスキーマ・型・変数   |

```typescript
// ❌ index.ts — ルート変数の外にヘルパーを定義
function formatResponse(data: unknown) { ... }

export const TaskApp = createApp()
  .get('/', async (c) => {
    return c.json(formatResponse(result))
  })

// ✅ index.ts — ロジックは Service に委譲、Controller はシンプルに保つ
export const TaskApp = createApp()
  .get('/', async (c) => {
    const result = await TaskService.list(query)
    return c.json(result)
  })
```

```typescript
// ❌ service.ts — オブジェクト外にヘルパーを定義
function buildWhereClause(filters: Filters) { ... }

export const TaskService = {
  async list(query: TaskModel.ListQuery) {
    const where = buildWhereClause(query)
  },
}

// ✅ service.ts — ヘルパーはオブジェクト内のプライベートメソッドとして定義
export const TaskService = {
  _buildWhereClause(filters: Filters) { ... },

  async list(query: TaskModel.ListQuery) {
    const where = TaskService._buildWhereClause(query)
  },
}
```

```typescript
// ❌ model.ts — namespace 外にスキーマを定義
const baseSchema = z.object({ id: z.string() })

export namespace TaskModel {
  export const Task = baseSchema.extend({ title: z.string() })
}

// ✅ model.ts — すべて namespace 内に定義
export namespace TaskModel {
  const baseSchema = z.object({ id: z.string() })
  export const Task = baseSchema.extend({ title: z.string() })
}
```

**例外**: `import` 文のみトップレベルに記述する。

---

## 3 層の責務

### Controller (`index.ts`)

> 1 Hono Router = 1 Controller

- `createApp()` で Hono インスタンスを生成
- `zValidator` でリクエストバリデーション
- Service を呼び出し、レスポンスを返す

```typescript
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
  .post('/', zValidator('json', TaskModel.CreateBody), async (c) => {
    const body = c.req.valid('json')
    const result = await TaskService.create(body)
    return c.json(result, 201)
  })
```

#### ❌ Don't: class ベースの Controller を作る

```typescript
// ❌
class TaskController {
  static async list(c: Context) { ... }
}
createApp().get('/', TaskController.list)
```

Hono インスタンスがそのまま Controller として機能する。class でラップすると二重の抽象化になる。

---

### Service (`service.ts`)

- ビジネスロジックと DB 操作をカプセル化
- Hono の `Context` に依存しない
- Model の型を引数・戻り値に使用
- `db` をトップレベル import して使用

```typescript
import { db } from '@server/db'
import { tasks } from '@server/db/schema'
import { NotFoundError } from '@server/lib/errors'
import type { TaskModel } from './model'

export const TaskService = {
  async list(query: TaskModel.ListQuery): Promise<TaskModel.ListResponse> {
    // ...
  },

  async create(body: TaskModel.CreateBody): Promise<TaskModel.CreateResponse> {
    const [data] = await db
      .insert(tasks)
      .values(body)
      .returning({ ...getTableColumns(tasks) })
    return { data }
  },
}
```

#### ❌ Don't: Context を渡す

```typescript
// ❌
TaskService.create(c)

// ✅
const body = c.req.valid('json')
TaskService.create(body)
```

---

### Model (`model.ts`)

- **namespace パターン** で Zod スキーマと型を同名で定義
- `drizzle-zod` で DB スキーマからバリデーションスキーマを生成
- リクエスト / レスポンスの型を明示的に定義

```typescript
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
}
```

#### ❌ Don't: interface と Zod スキーマを別々に定義する

```typescript
// ❌ 型の二重管理 → 乖離リスク
interface CreateTaskInput {
  title: string
}
const CreateTaskSchema = z.object({ title: z.string() })

// ✅ Zod スキーマから型を導出
export const CreateBody = z.object({ title: z.string() })
export type CreateBody = z.infer<typeof CreateBody>
```

---

## モジュールの登録

`server/index.ts` で `/api` 配下にマウントする。

```typescript
import { createApp } from './factory'
import { HealthCheckApp } from '@server/modules/health-check'
import { TaskApp } from '@server/modules/task'

const app = createApp().basePath('/api')

const routes = app
  .route('/health-check', HealthCheckApp)
  .route('/tasks', TaskApp)

export default app
export type AppType = typeof routes
```

`AppType` を export することで、クライアント側の `hc<AppType>()` で型安全な RPC が可能になる。

---

## エラーハンドリング

`ApiError` クラス階層を使用する。Service 層でスローし、`factory.ts` の `onError` で統一レスポンスに変換される。

| クラス              | ステータス | 用途                                  |
| ------------------- | ---------- | ------------------------------------- |
| `BadRequestError`   | 400        | 不正なリクエスト                      |
| `ValidationError`   | 400        | バリデーション失敗（Zod issues 付き） |
| `UnauthorizedError` | 401        | 認証エラー                            |
| `ForbiddenError`    | 403        | 権限不足                              |
| `NotFoundError`     | 404        | リソース未発見                        |

```typescript
import { NotFoundError } from '@server/lib/errors'

if (!data) {
  throw new NotFoundError('Task not found')
}
```

---

## ページネーション

リスト API には `withPagination` + `toPaginatedResponse` を使う。

```typescript
import { toPaginatedResponse, withPagination } from '@server/lib/pagination'

const [data, [{ total }]] = await Promise.all([
  withPagination(q.$dynamic(), { page: query.page, perPage: query.perPage }),
  db.select({ total: count() }).from(tasks),
])

return toPaginatedResponse(data, {
  page: query.page,
  perPage: query.perPage,
  total,
})
```

レスポンス形式:

```json
{
  "data": [...],
  "meta": { "page": 1, "perPage": 10, "total": 42, "totalPages": 5 }
}
```

---

## モジュール生成

scaffdog で 3 ファイルを自動生成できる。

```bash
bun run generate:module
```

1. モジュール名を入力（例: `product`）
2. CRUD テンプレートの有無を選択

### 生成後の手順

1. `server/db/schema.ts` にテーブル定義を追加
2. `server/index.ts` にモジュールのルートマウントを追加
3. DB マイグレーションを実行:
   ```bash
   bun run db:generate && bun run db:migrate
   ```

---

## シンプルモジュール

DB 不要・ビジネスロジックがない場合は `index.ts` のみで構成できる。

```typescript
import { createApp } from '@server/factory'

export const HealthCheckApp = createApp().get('/', (c) => {
  return c.json({ message: 'ok' })
})
```

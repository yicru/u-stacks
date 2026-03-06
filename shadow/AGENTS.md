# SHADOW STACK

TanStack Start + Hono + shadcn/ui (Base UI) + Drizzle + Turso on Cloudflare Workers.

## STRUCTURE

```
shadow/
├── src/
│   ├── routes/
│   │   ├── __root.tsx             # ルートレイアウト (shellComponent)
│   │   ├── index.tsx              # トップページ (ssr: false)
│   │   └── api/$.ts               # /api/* → Hono app.fetch() に委譲
│   ├── lib/
│   │   ├── utils.ts               # cn() ヘルパー
│   │   └── api-client.ts          # hc<AppType> 型安全 RPC クライアント
│   ├── components/ui/             # shadcn/ui (Base UI variant)
│   └── features/                  # ドメイン別 UI コンポーネント
├── server/
│   ├── index.ts                   # Hono app + basePath('/api') + モジュールマウント
│   ├── factory.ts                 # Hono ファクトリー + 共通ミドルウェア
│   ├── db/
│   │   ├── index.ts               # db — Drizzle + Turso インスタンス
│   │   └── schema.ts              # Drizzle テーブル定義
│   ├── modules/                   # MVC モジュール (詳細: server/modules/README.md)
│   │   ├── {name}/
│   │   │   ├── index.ts           # Controller — Hono ルート定義
│   │   │   ├── service.ts         # Service — ビジネスロジック + DB 操作
│   │   │   └── model.ts           # Model — Zod スキーマ + namespace 型定義
│   │   └── README.md              # モジュール設計規則
│   └── lib/                       # errors, validator, pagination, nanoid
├── scripts/
│   └── setup.ts                   # テンプレート初期化 (bun run setup)
├── .scaffdog/                     # scaffdog モジュール生成テンプレート
├── vite.config.ts                 # Cloudflare Vite plugin + TanStack Start
├── vitest.config.ts               # Vitest 設定 (Cloudflare plugin 除外)
├── wrangler.jsonc                 # Cloudflare Workers 設定
└── drizzle.config.ts              # Drizzle Kit (Turso)
```

## WHERE TO LOOK

| Task                | Location                   | Notes                                      |
| ------------------- | -------------------------- | ------------------------------------------ |
| Add page            | `src/routes/`              | TanStack Router ファイルベースルーティング |
| Add API module      | `server/modules/`          | `bun run generate:module` で CRUD 自動生成 |
| Add UI component    | `src/components/ui/`       | `bunx shadcn add <name>` (Base UI variant) |
| DB schema           | `server/db/schema.ts`      | Drizzle SQLite dialect                     |
| Env vars (dev)      | `.dev.vars`                | Turso URL + auth token                     |
| Env vars (prod)     | `.dev.vars.production`     | dotenvx でデプロイ時に読み込み             |
| Module design rules | `server/modules/README.md` | Elysia MVC パターン準拠                    |

## CONVENTIONS

- Package manager: **bun** (`bun install`, `bun add`, `bun run`)
- Path alias: `@/*` → `src/*`, `@server/*` → `server/*`, `#/*` → `src/*` (subpath imports)
- Lint: oxlint (Rust 製)、Format: oxfmt (Prettier 互換、Tailwind クラスソート内蔵)
- Type check: `tsc -p tsconfig.check.json --noEmit`
- Icon: `@hugeicons/react` + `@hugeicons/core-free-icons`
- DB instance: `import { db } from '@server/db'` — モジュールトップレベルで import
- SPA mode: ルート単位で `ssr: false` を設定し、apiClient 経由でデータ取得
- `src/` 下から `server/` への直接 import は禁止。apiClient (`hc<AppType>`) 経由で通信
- Data fetching via TanStack Router loaders + `router.invalidate()` for revalidation
- Tailwind CSS v4 with oklch colors + `@custom-variant dark` in `styles.css`
- Vitest configured (jsdom) but no test files yet — add `*.test.ts(x)` alongside source
- `noUnusedLocals: true`, `noUnusedParameters: true`, `noUncheckedSideEffectImports: true` in tsconfig
- 日時表示は `src/lib/date.ts` の `formatDateTime()` (`date-fns`) を使う — `toLocaleDateString()` 等のネイティブ API は SSR 環境(UTC)で表示がズレるため禁止

## IMPORTANT CONSTRAINTS

### `@libsql/client` は `0.15.15` にピン

`@libsql/client@0.17.0` は `@libsql/hrana-client@0.9.0` 経由で `cross-fetch` に依存。
`cross-fetch` は workerd (Cloudflare Workers) で `XMLHttpRequest is not defined` エラーを起こす。
`0.15.15` は `@libsql/isomorphic-fetch` を使い、workerd export condition でネイティブ fetch に解決される。

upstream issue: https://github.com/tursodatabase/libsql-client-ts/issues/339

### `cloudflare:workers` の `env` はモジュールトップレベルで使える

`import { env } from 'cloudflare:workers'` はリクエストハンドラ外でもアクセス可能。
DB クライアントの初期化をモジュールトップレベルで行える（`createDb()` ファクトリは不要）。

### Vitest は Cloudflare Vite plugin と競合する

`vite.config.ts` を共用すると `resolve.external` エラーが発生する。
`vitest.config.ts` を別途用意し、Cloudflare plugin を除外すること。

### shadcn/ui は Base UI variant を使用

Radix UI ではなく `@base-ui/react` ベース。`components.json` の `registry` が `base` に設定されている。

## COMMANDS

```bash
bun run setup              # テンプレート初期化 (アプリ名をディレクトリ名に置換)
bun run dev                # Dev server (port 3000)
bun run build              # Production build
bun run lint               # typecheck + oxlint + oxfmt
bun run format             # oxlint --fix + oxfmt
bun run test               # Vitest
bun run generate:module    # scaffdog でモジュール CRUD 生成
bun run db:generate        # Drizzle Kit generate
bun run db:migrate         # Drizzle Kit push (dev)
bun run db:migrate:prod    # Drizzle Kit push (prod)
bun run db:studio          # Drizzle Studio
bun run deploy             # Cloudflare Workers デプロイ
bun run cf-typegen         # Cloudflare env 型生成
```

## TEMPLATE SETUP

```bash
npx degit yicru/u-stacks/shadow my-app
cd my-app
bun run setup    # package.json, wrangler.jsonc, .cta.json のアプリ名を置換
bun install
cp .dev.vars.example .dev.vars   # Turso 接続情報を設定
bun run db:migrate
bun run dev
```

## ANTI-PATTERNS

- `as any`, `@ts-ignore`, `@ts-expect-error` は使わない
- コードにコメントを書かない
- `useEffect` は複雑なシナリオ以外で使わない
- `src/` から `server/` を直接 import しない (apiClient 経由)
- `server/modules/` 内の各ファイルでトップレベルにヘルパー関数や変数を散在させない (スコープルール)
- `@libsql/client` を `0.17.0` 以上に上げない (cross-fetch 問題)
- `worker-configuration.d.ts` は `cf-typegen` で自動生成 — 手動編集しない
- `src/routeTree.gen.ts` は TanStack Router が自動生成 — 手動編集しない
- 日時表示に `toLocaleDateString()` / `toLocaleTimeString()` を直接使わない (`src/lib/date.ts` 経由)

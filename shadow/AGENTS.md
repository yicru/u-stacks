# SHADOW STACK

TanStack Start + Effect HTTP API + shadcn/ui (Base UI) + Drizzle + Turso on Cloudflare Workers.

## STRUCTURE

```text
shadow/
├── shared/api/
│   ├── index.ts                   # Top-level AppApi composition
│   ├── errors.ts                  # Shared error Schema.Class values
│   ├── schema-error-middleware.ts # HttpApiSchemaError → ValidationError
│   ├── pagination.ts              # Shared pagination query and metadata schemas
│   └── {resource}.ts              # Request, response, params, and payload schemas
├── src/
│   ├── routes/
│   │   ├── __root.tsx             # Root layout
│   │   ├── index.tsx              # Top page
│   │   └── api/$.ts               # /api/* Web Request bridge
│   ├── start.ts                    # defaultSsr: false
│   ├── lib/
│   │   ├── api-client.ts          # HttpApiClient generated from AppApi
│   │   └── utils.ts               # cn() helper
│   ├── components/ui/             # shadcn/ui Base UI variant
│   └── features/                  # Domain UI components
├── server/
│   ├── index.ts                   # Production Layer composition
│   ├── handler.ts                 # Effect API Web handler factory
│   ├── db/
│   │   ├── index.ts               # Database Context.Service
│   │   ├── live.ts                # Turso/Drizzle Layer
│   │   └── schema.ts              # Drizzle tables
│   ├── modules/{name}/
│   │   ├── handlers.ts            # HttpApiBuilder.group
│   │   ├── service.ts             # Context.Service + Live Layer
│   │   └── service.test.ts        # Service behavior tests
│   └── lib/                       # Pagination and ID utilities
├── scripts/setup.ts               # Template initialization
├── .scaffdog/module.md            # Effect module generator
├── vite.config.ts
├── vitest.config.ts
├── wrangler.jsonc
└── drizzle.config.ts
```

## WHERE TO LOOK

| Task                | Location                               | Notes                              |
| ------------------- | -------------------------------------- | ---------------------------------- |
| Add page            | `src/routes/`                          | TanStack Router file-based routing |
| Define API contract | `shared/api/`                          | Effect Schema and HttpApi groups   |
| Implement endpoint  | `server/modules/`                      | Handler and service Layers         |
| Compose runtime     | `server/handler.ts`, `server/index.ts` | Web handler and production Layers  |
| Add UI component    | `src/components/ui/`                   | `bunx shadcn add <name>`           |
| DB schema           | `server/db/schema.ts`                  | Drizzle SQLite dialect             |
| Module rules        | `server/modules/README.md`             | Registration and testing workflow  |

## CONVENTIONS

- Package manager: bun only
- Effect: `effect@beta` (v4)
- Path aliases: `@/*` → `src/*`, `@server/*` → `server/*`, `@shared/*` → `shared/*`, `#/*` → `src/*`
- API source of truth: `shared/api`
- Pagination contract: reuse `shared/api/pagination.ts` across resource modules
- Endpoint identifiers: `getResources`, `getResource`, `createResource`, `updateResource`, `deleteResource`
- Client request fields: `query` / `params` / `payload`
- Request, response, and error validation: Effect Schema
- HTTP API: `effect/unstable/httpapi` (`HttpApi`, `HttpApiBuilder`, `HttpApiClient`)
- HTTP runtime: `effect/unstable/http` (`HttpRouter.toWebHandler`, `FetchHttpClient`, `HttpServer.layerServices`)
- Browser client: `HttpApiClient.make` with `FetchHttpClient`
- Service dependencies: `Context.Service`
- Production and test implementations: Layer
- Database resources: `Layer.effect` with `Effect.acquireRelease`
- Service methods: `Effect.fn`
- Handlers: yield services while building the group, then close over them
- DB Promise failures: `Effect.tryPromise`, logged and mapped to typed API errors
- Data fetching: TanStack Router loaders plus `router.invalidate()`
- Toolchain: Vite+ with oxlint, oxfmt, React Doctor, and Fallow
- Tests: Vitest beside contracts, services, handler, and client
- Icons: `@hugeicons/react` and `@hugeicons/core-free-icons`
- Date display: `src/lib/date.ts` `formatDateTime()`
- Local database: `turso dev` backed by `.turso/dev.db`, preferring `127.0.0.1:8080` and falling back to a free port

## MODULE WORKFLOW

```bash
bun run generate:module
```

The generator creates:

```text
shared/api/{name}.ts
server/modules/{name}/handlers.ts
server/modules/{name}/service.ts
server/modules/{name}/service.test.ts
```

After generation:

1. Add the Drizzle table to `server/db/schema.ts`
2. Add the API group to `AppApi` in `shared/api/index.ts`
3. Add the handler Layer and service requirement to `server/handler.ts`
4. Provide the service Live Layer in `server/index.ts`
5. Run database migration, tests, lint, and build

## IMPORTANT CONSTRAINTS

### Shared contract boundary

Browser code must not import runtime values from `server/`. It imports `AppApi` and resource types from `shared/api`, then calls `src/lib/api-client.ts`. The only exception is `src/routes/api/$.ts`, the TanStack Start server bridge.

### `@libsql/client` pin

Keep `@libsql/client` at exactly `0.17.4`. This version uses native `fetch` and avoids the workerd `XMLHttpRequest is not defined` regression.

### Cloudflare environment

`DatabaseLive` reads `env` from `cloudflare:workers` and owns the libSQL client lifecycle. Do not create a separate client inside modules.

Local development uses the HTTP endpoint started by `bun run dev`; Workers must not receive a `file:` URL. Drizzle migration and Studio commands access `.turso/dev.db` directly, while remote credentials belong only in `.dev.vars.production`.

### SSR self-reference

`src/start.ts` sets `defaultSsr: false`. Route loaders therefore call `/api` from the browser. Enabling SSR for a route can make the Worker fetch itself, which Cloudflare Workers rejects. Use a server-side service call for SSR data loading.

### Generated files

Do not edit `worker-configuration.d.ts` or `src/routeTree.gen.ts` manually.

## COMMANDS

```bash
bun run setup
bun run dev
bun run build
bun run lint
bun run format
bun run doctor
bun run fallow
bun run fallow:audit
bun run quality
bun run test
bun run generate:module
bun run db:generate
bun run db:migrate
bun run db:migrate:prod
bun run db:studio
bun run deploy
bun run cf-typegen
```

## ANTI-PATTERNS

- No `as any`, `@ts-ignore`, or `@ts-expect-error`
- No code comments
- Do not import `server/` from browser code
- Do not define request or response types separately from their Schema
- Do not turn typed service failures into untyped thrown errors
- Do not open database clients inside request handlers or services
- Do not add `useEffect` when render logic, events, or framework data flow can express the behavior
- Do not upgrade `@libsql/client`
- Do not edit generated files

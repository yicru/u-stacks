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
├── cloudflare.config.ts
└── drizzle.config.ts
```

## WHERE TO LOOK

| Task                | Location                               | Notes                                 |
| ------------------- | -------------------------------------- | ------------------------------------- |
| Add page            | `src/routes/`                          | TanStack Router file-based routing    |
| Define API contract | `shared/api/`                          | Effect Schema and HttpApi groups      |
| Implement endpoint  | `server/modules/`                      | Handler and service Layers            |
| Compose runtime     | `server/handler.ts`, `server/index.ts` | Web handler and production Layers     |
| Add UI component    | `src/components/ui/`                   | `bunx --bun shadcn@latest add <name>` |
| DB schema           | `server/db/schema.ts`                  | Drizzle SQLite dialect                |
| Module rules        | `server/modules/README.md`             | Registration and testing workflow     |

## CONVENTIONS

- Package manager: bun only
- Effect: stable v4
- Path aliases: `@/*` → `src/*`, `@server/*` → `server/*`, `@shared/*` → `shared/*`, `#/*` → `src/*`
- API source of truth: `shared/api`
- Pagination contract: reuse `shared/api/pagination.ts` across resource modules
- Endpoint identifiers: `getResources`, `getResource`, `createResource`, `updateResource`, `deleteResource`
- Client request fields: `query` / `params` / `payload`
- Request, response, and error validation: Effect Schema
- HTTP API: `effect/http-api` (`HttpApi`, `HttpApiBuilder`, `HttpApiClient`)
- HTTP runtime: `effect/http` (`HttpRouter.toWebHandler`, `FetchHttpClient`, `HttpServer.layerServices`)
- Browser client: `HttpApiClient.make` with `FetchHttpClient`
- Service dependencies: `Context.Service`
- Production and test implementations: Layer
- Database resources: `Layer.effect` with `Effect.acquireRelease`
- Service methods: `Effect.fn`
- Handlers: yield services while building the group, then close over them
- DB Promise failures: `Effect.tryPromise`, logged and mapped to typed API errors
- Data fetching: TanStack Router loaders plus `router.invalidate()`
- Toolchain: Vite+ 1.0 with TypeScript 7, oxlint, oxfmt, React Doctor, and Fallow
- Tests: Vitest 5 via `vite-plus/test` beside contracts, services, handler, and client
- Icons: `@hugeicons/react` and `@hugeicons/core-free-icons`
- Class names: `cn` package, re-exported by `src/lib/utils.ts`
- Notifications: `toast.add()` from `src/components/ui/toast.tsx`; mount `Toaster` once in the root layout
- Date display: `src/lib/date.ts` `formatDateTime()`
- Local database: `turso dev` backed by `.turso/dev.db`, preferring `127.0.0.1:8080` and falling back to a free port

## EFFECT DOCUMENTATION

For Effect implementation, review, setup, or upgrades, read `.agents/skills/effect-ts/SKILL.md`. This project skill adapts the official Effect skill for Bun and stable v4 and is included in standalone template checkouts.

Before writing Effect code, read `node_modules/effect/AGENTS.md` completely and follow its links when required. For APIs it does not cover, inspect `node_modules/effect/src` and the installed package's exports and types. HTTP modules retain `@stability unstable` annotations; use the installed version's documentation.

## SHADCN DOCUMENTATION

Before working on shadcn UI, read `.agents/skills/shadcn/SKILL.md` and the relevant linked rules. This project skill is stored inside the template so a standalone `degit` checkout keeps its instructions and references. Run the CLI with `bunx --bun shadcn@latest` from the application directory; this template uses Base UI and Hugeicons.

`@shadcn/lint` is registered in `vite.config.ts` through `lint.jsPlugins`. Its design-system rules are not enabled; configure `lint.rules` explicitly when adopting a rule policy. Preserve the existing component-source ignores.

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

### Cloudflare environment

`DatabaseLive` reads `env` from `cloudflare:workers` and owns the libSQL client lifecycle. Do not create a separate client inside modules.

Local development uses the HTTP endpoint started by `bun run dev`; Workers must not receive a `file:` URL. Drizzle migration and Studio commands access `.turso/dev.db` directly, while remote credentials belong only in `.dev.vars.production`.

Use Bun 1.4.2 or later and Node.js `^22.22.2 || ^24.15.0 || >=26.0.0`, matching the Vite+ and jsdom requirements. Bun remains the package manager; cf loads configuration with Node.js. `cloudflare.config.ts` is the typed Worker configuration, with secrets declared through `bindings.secret()`. `.cloudflare/types/index.d.ts` is generated by `bun run cf-typegen` and included explicitly in TypeScript.

The compatibility date `2026-09-30` matches the pinned Vite plugin's workerd runtime. It enables Node.js compatibility by default. Keep logs enabled and traces sampled at 1%; review compatibility changes and run the local Worker when advancing the Cloudflare toolchain.

Named cf profile and account selection belong in the ignored `.cloudflare.json`; setup sets the same `accountId` in `cloudflare.config.ts`. cf requires its own login and does not reuse Wrangler credentials. Run remote operations through `bun run cloudflare -- <command>` so `--profile` and `CLOUDFLARE_ACCOUNT_ID` are applied together. Do not use direct remote cf commands or ambient credential variables.

Setup stores identity only. Add bindings inside `withCloudflareResourceIds()`, then use `status`, `plan`, and `apply --yes`. Managed apply creates KV, D1, and R2 only; returned IDs are saved in `cloudflare.resources.json` by account and Worker name. Commit the identifier file after applying. It never deletes or rolls back resources.

Use `--mode`, not Wrangler's `--env`. The wrapper defaults to `production`. Guarded deployment validates the source configuration and actual Build Output, including account, Worker name, mode, and unresolved bindings, and verifies named resources that cf might otherwise provision. Keep deployment behind the wrapper; preview and version uploads require equivalent guards before enabling.

Keep `vp` for dev/build/preview: cf's framework detection delegates to `bunx vite`, which cannot execute the Vite+ core alias. The cf-compatible Vite plugin emits `.cloudflare/output/v0`; the wrapper builds once and invokes `cf deploy --prebuilt`. Keep cf, Vite plugin v2, and their config/build-output helper versions pinned together during beta.

### Dependency and quality tools

Keep `vite-plus` and the `vite` alias/override on the same exact release. Use `vite-plus/test` in tests and `.scaffdog/module.md`. The esbuild override removes the vulnerable older version used by Drizzle's config loader; validate isolated schema generation when changing it.

Fallow entry points include Cloudflare configuration and T3 worktree helpers that are loaded by filename or subprocess. Its Portless exclusion reflects an actual CLI dependency in `scripts/dev.ts`. Full `fallow` analysis remains part of `quality`; the separate `fallow:audit` command uses the configured changeset gate.

The Fallow dependency exclusions cover component-library imports in the ignored UI sources, including `cn` and `@shadcn/react`. `@shadcn/lint` is loaded by its package name in `lint.jsPlugins`, rather than a static import. Vendored skill files are excluded from source-quality checks, formatting, and Tailwind class scanning.

The README records the unpatched braces and node-forge advisories and their development-only consumers. Keep `bun audit` findings visible and recheck upstream releases instead of suppressing them.

### SSR self-reference

`src/start.ts` sets `defaultSsr: false`. Route loaders therefore call `/api` from the browser. Enabling SSR for a route can make the Worker fetch itself, which Cloudflare Workers rejects. Use a server-side service call for SSR data loading.

### Generated files

Do not edit `.cloudflare/types/index.d.ts` or `src/routeTree.gen.ts` manually.

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
bun run cloudflare -- status
bun run cloudflare -- plan
bun run cloudflare -- apply --yes
bun run cloudflare -- <command>
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
- Do not edit generated files

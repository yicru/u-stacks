# PROJECT KNOWLEDGE BASE

**Generated:** 2026-03-01
**Commit:** 7b794ee
**Branch:** feature/shadow

## OVERVIEW

Multi-stack starter template collection. Each stack is independent (`npx degit yicru/u-stacks/<stack> my-app`) with shared Hono API pattern.

## STRUCTURE

```
u-stacks/
├── tails/                  # Next.js 15 + Radix/shadcn + Better Auth + Drizzle + Cloudflare Pages
├── sonic/                  # React Router v7 + Mantine + Clerk + Fly.io
├── shadow/                 # TanStack Start + shadcn(Base UI) + Drizzle + Cloudflare Workers
├── .github/workflows/      # CI/CD (Sonic deploy only)
└── AGENTS.md               # Per-stack knowledge bases
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Edge-first app (Next.js) | `tails/` | Cloudflare Pages + Turso + Better Auth |
| Edge-first app (TanStack) | `shadow/` | Cloudflare Workers + Turso + bun |
| Traditional fullstack | `sonic/` | Fly.io + PostgreSQL + Clerk + Mantine |
| CI/CD | `.github/workflows/` | Only `deploy-sonic.yml` exists |

## SHARED PATTERNS (ALL STACKS)

### Server Layer

- Hono framework for all API routes
- `server/index.ts` → app definition with route mounting on `/api` base path
- `server/factory.ts` → Hono instance creation with middleware injection
- `server/routes/*.ts` → domain route handlers (shadow uses `server/modules/` MVC pattern instead)
- Type-safe RPC via `hc<AppType>` (Hono client)

### Client Layer

- React 19 + TypeScript strict mode
- `features/` directory for domain logic (task CRUD as example)
- TanStack Query for server state (tails) / React Router loaders (sonic) / TanStack Router loaders (shadow)
- Tailwind CSS v4 (tails, shadow) / v3 (sonic)

### Tooling

- Lint/format: Biome (tails, sonic) / oxlint + oxfmt (shadow)
- No test framework except shadow (Vitest + Testing Library)
- Each stack has own `package.json`, config files, `tsconfig.json`

## STACK COMPARISON

| | tails | sonic | shadow |
|---|---|---|---|
| Framework | Next.js 15 | React Router v7 | TanStack Start |
| UI | shadcn/ui (Radix) | Mantine | shadcn/ui (Base UI) |
| Auth | Better Auth | Clerk | None |
| ORM | Drizzle (Turso) | Prisma (PostgreSQL) | Drizzle (Turso) |
| Deploy | Cloudflare Pages | Fly.io | Cloudflare Workers |
| Pkg manager | npm | npm | **bun** |
| Lint | Biome 2.1.4 | Biome 1.9.4 | oxlint + oxfmt |
| Path alias | `@/*` `@server/*` | `~/*` | `@/*` `@server/*` `#/*` |
| Test | None | None | Vitest |

## CONVENTIONS

- Path aliases differ: tails/shadow `@/*` + `@server/*` vs sonic `~/*` (shadow also has `#/*` subpath imports)
- Lint tool split: Biome (tails/sonic) vs oxlint+oxfmt (shadow)
- Biome version mismatch: tails=2.1.4, sonic=1.9.4
- No shared code between stacks — consumed independently via `degit`
- ORM split: tails/shadow=Drizzle (Turso/libSQL), sonic=Prisma (PostgreSQL)
- shadow uses `bun` exclusively — never `npm`

## ANTI-PATTERNS

- Do NOT add root-level dependencies — stacks are independent
- Do NOT share code between stacks — they are `degit` templates
- No `as any`, `@ts-ignore`, `@ts-expect-error` (clean codebase, keep it that way)
- No comments in code
- Auto-generated files — do not edit:
  - `tails/cloudflare-env.d.ts` (Wrangler)
  - `tails/server/db/auth-schema.ts` (Better Auth)
  - `shadow/worker-configuration.d.ts` (Wrangler)
  - `shadow/src/routeTree.gen.ts` (TanStack Router)
- shadow: `@libsql/client` pinned to `0.15.15` — do NOT upgrade (cross-fetch workerd issue)
- shadow: Do NOT import `server/` from `src/` directly — use apiClient (`hc<AppType>`)

## COMMANDS

```bash
# tails / sonic (npm)
npm run dev        # Dev server
npm run build      # Production build
npm run lint       # Biome check
npm run format     # Biome fix
npm run typecheck  # tsc --noEmit

# shadow (bun)
bun run dev        # Dev server
bun run build      # Production build
bun run lint       # typecheck + oxlint + oxfmt
bun run format     # oxlint --fix + oxfmt
bun run test       # Vitest
bun run generate:module  # scaffdog module CRUD generation
```

## NOTES

- Stacks are NOT a monorepo workspace — no root package.json
- Only Sonic has GitHub Actions CI (`deploy-sonic.yml` → Fly.io)
- Tails deploys via OpenNext to Cloudflare Pages (`npm run deploy:production`)
- Shadow deploys via Wrangler to Cloudflare Workers (`bun run deploy`)
- shadow has unique MVC module pattern (`server/modules/{name}/` with index/service/model)

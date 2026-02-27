# PROJECT KNOWLEDGE BASE

**Generated:** 2026-02-27
**Commit:** ce692b3
**Branch:** main

## OVERVIEW

Multi-stack starter template collection. Each stack is independent (`npx degit yicru/u-stacks/<stack> my-app`) with shared Hono API pattern.

## STRUCTURE

```
u-stacks/
├── tails/                  # Next.js 15 + Radix/shadcn + Better Auth + Drizzle + Cloudflare
├── sonic/                  # React Router v7 + Mantine + Clerk + Fly.io
├── hono-on-react-router/   # React Router v7 + Hono + Prisma (minimal)
├── .github/workflows/      # CI/CD (Sonic deploy only)
└── CLAUDE.md               # LLM guidance
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Edge-first app | `tails/` | Cloudflare Pages + Turso + Better Auth |
| Traditional fullstack | `sonic/` | Fly.io + PostgreSQL + Clerk + Mantine |
| Custom/minimal app | `hono-on-react-router/` | No auth/UI lib — bring your own |
| Add new stack | Root directory | Copy `hono-on-react-router/` as minimal template |
| CI/CD | `.github/workflows/` | Only `deploy-sonic.yml` exists |

## SHARED PATTERNS (ALL STACKS)

### Server Layer

- Hono framework for all API routes
- `server/index.ts` → app definition with route mounting on `/api` base path
- `server/factory.ts` → Hono instance creation with middleware injection
- `server/routes/*.ts` → domain route handlers
- Type-safe RPC via `hc<AppType>` (Hono client)

### Client Layer

- React 19 + TypeScript strict mode
- `features/` directory for domain logic (task CRUD as example)
- TanStack Query for server state (tails, sonic)
- Tailwind CSS with Biome-enforced sorted classes

### Tooling

- Biome for lint + format (2-space, 80 char, single quotes, ASI)
- No test framework — add Vitest/Jest as needed
- Each stack has own `package.json`, `biome.json`, `tsconfig.json`

## CONVENTIONS

- Path aliases differ: tails `@/*` + `@server/*` vs sonic/hono `~/*`
- Biome version mismatch: tails=2.1.4, sonic/hono=1.9.4
- No shared code between stacks — consumed independently via `degit`
- ORM split: tails=Drizzle (Turso/libSQL), sonic/hono=Prisma (PostgreSQL)

## ANTI-PATTERNS

- Do NOT add root-level dependencies — stacks are independent
- Do NOT share code between stacks — they are `degit` templates
- No `as any`, `@ts-ignore`, `@ts-expect-error` (clean codebase, keep it that way)
- `tails/cloudflare-env.d.ts` is auto-generated — do not edit
- `tails/server/db/auth-schema.ts` is Better Auth generated — do not edit

## COMMANDS

```bash
# Per-stack (cd into stack directory first)
npm run dev        # Dev server
npm run build      # Production build
npm run lint       # Biome check
npm run format     # Biome fix
npm run typecheck  # tsc --noEmit
```

## NOTES

- Stacks are NOT a monorepo workspace — no root package.json
- Only Sonic has GitHub Actions CI (`deploy-sonic.yml` → Fly.io)
- Tails deploys via OpenNext to Cloudflare Pages (`npm run deploy:production`)
- Hono stack has Dockerfile but no platform-specific deploy config

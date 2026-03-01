# U-Stacks Project Overview

Multi-stack starter template collection. Each stack is independent (`npx degit yicru/u-stacks/<stack> my-app`) with shared Hono API pattern.

## Available Stacks

### 1. Tails Stack
- **Framework**: Next.js 15 (App Router)
- **UI**: shadcn/ui (Radix)
- **Auth**: Better Auth
- **ORM**: Drizzle (Turso/libSQL)
- **Deploy**: Cloudflare Pages (OpenNext)
- **Lint/Format**: Biome 2.1.4
- **Pkg Manager**: npm
- **Path Alias**: `@/*`, `@server/*`

### 2. Sonic Stack
- **Framework**: React Router v7
- **UI**: Mantine
- **Auth**: Clerk
- **ORM**: Prisma (PostgreSQL)
- **Deploy**: Fly.io
- **Lint/Format**: Biome 1.9.4
- **Pkg Manager**: npm
- **Path Alias**: `~/*`

### 3. Shadow Stack
- **Framework**: TanStack Start
- **UI**: shadcn/ui (Base UI)
- **Auth**: None
- **ORM**: Drizzle (Turso/libSQL)
- **Deploy**: Cloudflare Workers (Wrangler)
- **Lint/Format**: oxlint + oxfmt
- **Test**: Vitest + Testing Library
- **Pkg Manager**: **bun** (not npm)
- **Path Alias**: `@/*`, `@server/*`, `#/*`

## Common Technologies
- TypeScript strict mode
- React 19
- Hono for API routes (all stacks)
- Tailwind CSS (v4 for tails/shadow, v3 for sonic)
- Type-safe RPC via `hc<AppType>` (Hono client)
- Zod for validation

## Key Constraints
- Stacks are NOT a monorepo — no root package.json
- No shared code between stacks (consumed via degit)
- Do NOT add root-level dependencies
- `@libsql/client` pinned to 0.15.15 in shadow (cross-fetch workerd issue)
- shadow: Do NOT import `server/` from `src/` directly — use apiClient
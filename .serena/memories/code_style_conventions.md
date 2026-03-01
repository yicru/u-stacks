# Code Style and Conventions

## Lint/Format Tools
- **tails**: Biome 2.1.4
- **sonic**: Biome 1.9.4
- **shadow**: oxlint + oxfmt

## General Style
- TypeScript strict mode
- No comments in code
- Never use `any` type
- No `as any`, `@ts-ignore`, `@ts-expect-error`
- ES modules (`"type": "module"`)
- React 19 patterns

## Naming Conventions
- React components: PascalCase
- Files: kebab-case for routes, PascalCase for components
- Variables/functions: camelCase

## Path Aliases
- tails/shadow: `@/*` + `@server/*`
- shadow additional: `#/*` (subpath imports)
- sonic: `~/*`

## Server Layer Patterns
- `server/index.ts` → Hono app definition with route mounting on `/api`
- `server/factory.ts` → Hono instance creation with middleware
- `server/routes/*.ts` → domain route handlers (tails, sonic)
- `server/modules/{name}/` → MVC pattern (shadow only)
- Type-safe RPC via `hc<AppType>` (Hono client)

## Client Layer Patterns
- `features/` directory for domain logic
- TanStack Query (tails) / React Router loaders (sonic) / TanStack Router loaders (shadow)
- Tailwind CSS v4 (tails, shadow) / v3 (sonic)

## Test
- Only shadow has tests: Vitest + Testing Library
- tails and sonic have no test framework
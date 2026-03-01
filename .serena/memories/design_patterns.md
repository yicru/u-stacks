# Design Patterns

## API Design
- All stacks use Hono framework for API routes
- RESTful APIs mounted on `/api` base path
- Validation with Zod schemas for type safety
- Type-safe client via `hc<AppType>` (Hono client)

## Authentication
- **tails**: Better Auth with database sessions (Drizzle)
- **sonic**: Clerk with JWT tokens and middleware
- **shadow**: No auth

## Database
- **tails/shadow**: Drizzle ORM with Turso (libSQL)
- **sonic**: Prisma ORM with PostgreSQL
- Schema-first approach
- shadow constraint: `@libsql/client` pinned to 0.15.15

## Component Architecture
- **tails**: Server Components default, "use client" for interactivity, shadcn/ui (Radix)
- **sonic**: Mantine component library, mantine-form
- **shadow**: shadcn/ui with Base UI primitives, TanStack Router file-based routing

## State Management
- Server state preferred (loaders/actions)
- Client state with React hooks when necessary
- shadow: Do NOT import `server/` from `src/` — use apiClient (`hc<AppType>`)

## Module Pattern (shadow only)
- `server/modules/{name}/index.ts` — route definitions
- `server/modules/{name}/service.ts` — business logic
- `server/modules/{name}/model.ts` — data access
- Scaffolding: `bun run generate:module`

## File Organization
- Feature-based: `features/` (sonic, shadow)
- Route-based: `src/app/` (tails), `src/routes/` (shadow), `app/` (sonic)
- Shared utilities: `lib/` or `server/lib/`
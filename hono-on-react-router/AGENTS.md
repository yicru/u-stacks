# HONO ON REACT ROUTER

Minimal React Router v7 + Hono API + Prisma. No auth, no UI library — bring your own.

## STRUCTURE

```
hono-on-react-router/
├── app/                    # React Router v7 routes
│   ├── root.tsx            # Root layout (minimal, Tailwind only)
│   ├── routes.ts           # Route definitions
│   └── page.tsx            # Home page
├── features/
│   └── task/               # Task domain (components/)
├── lib/                    # Shared utils (api.ts, env.server.ts)
├── server/
│   ├── factory.ts          # Hono app factory (no middleware)
│   ├── index.ts            # Route mounting + X-Powered-By header
│   ├── client.ts           # Prisma client export
│   └── routes/             # API handlers (root.ts, task.ts)
├── prisma/schema.prisma    # PostgreSQL schema (Task model only)
├── types/                  # Shared type definitions
└── Dockerfile              # Multi-stage Node 20 Alpine build
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Add page | `app/` | React Router v7 file-based routing |
| Add API endpoint | `server/routes/` | Hono route → register in `server/index.ts` |
| Add auth | `server/factory.ts` | No auth — add middleware here |
| Add UI library | `app/root.tsx` | No UI lib — add providers here |
| DB schema | `prisma/schema.prisma` | Prisma (PostgreSQL) — Task model only |
| Add feature | `features/<name>/` | Component-first organization |
| Env vars | `.env.example` | `DATABASE_URL`, `VITE_API_URL` |

## CONVENTIONS

- Path alias: `~/*` → `app/*`
- Hono factory has zero middleware — cleanest starting point for customization
- Custom `X-Powered-By: React Router and Hono` header in `server/index.ts`
- No User model — add to Prisma schema when implementing auth
- Same build pipeline as Sonic: `main.ts` → tsup → `main.mjs`
- Deploy target: Any Node.js host (Dockerfile included, no platform config)

## COMMANDS

```bash
npm run db:push   # Push Prisma schema to PostgreSQL
```

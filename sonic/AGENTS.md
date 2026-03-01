# SONIC STACK

React Router v7 + Mantine UI + Clerk Auth + Hono API + Prisma + Fly.io.

## STRUCTURE

```
sonic/
├── app/                    # React Router v7 routes
│   ├── root.tsx            # Root layout (Mantine + Clerk providers)
│   ├── routes.ts           # Route definitions
│   └── page.tsx            # Home page
├── features/
│   └── task/               # Task domain (components/)
├── lib/                    # Shared utils (api.ts, env.server.ts, theme.ts)
├── server/
│   ├── factory.ts          # Hono app + Clerk middleware + Prisma injection
│   ├── index.ts            # Route mounting
│   ├── client.ts           # Prisma client export
│   └── routes/             # API handlers (root.ts, task.ts)
├── prisma/schema.prisma    # PostgreSQL schema (User + Task)
├── types/                  # Shared type definitions
├── main.ts                 # Node.js entry (Hono serve + static files)
├── fly.toml                # Fly.io app config (nrt region)
├── fly.db.toml             # Fly.io PostgreSQL config
└── Dockerfile              # Multi-stage Node 20.11.1 build
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Add page | `app/` | React Router v7 file-based routing |
| Add API endpoint | `server/routes/` | Hono route → register in `server/index.ts` |
| Auth middleware | `server/factory.ts` | Clerk middleware + auto user creation |
| DB schema | `prisma/schema.prisma` | Prisma (PostgreSQL) — User + Task models |
| Add feature | `features/<name>/` | Component-first organization |
| Env vars | `.env.example` | `DATABASE_URL`, `CLERK_*`, `VITE_*` |
| Deploy | `npm run deploy` | Fly.io (requires `flyctl`) |
| CI/CD | `.github/workflows/deploy-sonic.yml` | Auto-deploy on push to main/sonic branch |

## CONVENTIONS

- Path alias: `~/*` → `app/*`
- Hono factory auto-resolves Clerk user → creates DB record on first auth
- Build pipeline: `main.ts` → tsup/esbuild → `main.mjs` (production entry)
- Fly.io release command runs `npm run db:push` on every deploy
- Mantine theme config in `lib/theme.ts`
- Hono RPC client in `lib/api.ts` via `hc<AppType>`
- Data fetching via React Router loaders (no TanStack Query)
- Tailwind CSS v3 with Mantine layer integration in `app/app.css`
- `lib/env.ts` + `lib/env.server.ts` — Zod-validated environment variables
- Biome v1.9.4 — `noConsoleLog: warn`, `useImportType: off`
- `verbatimModuleSyntax: true` in tsconfig

## COMMANDS

```bash
npm run db:push    # Push Prisma schema to PostgreSQL
npm run deploy     # Deploy to Fly.io
npm run deploy:db  # Create Fly.io PostgreSQL instance
```

## NOTES

- GitHub Actions secret required: `FLY_API_TOKEN` (generate via `fly tokens create deploy -x 999999h`)
- Fly.io region: `nrt` (Tokyo) — change in `fly.toml` if needed

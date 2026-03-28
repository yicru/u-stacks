# Shadow Stack

A full-stack starter built with TanStack Start, Hono, Drizzle, Turso, and Cloudflare Workers.

Shadow is designed for building edge-first applications with a type-safe API layer, a modern React UI stack, and a setup flow that can bootstrap Turso interactively.

## Features

- TanStack Start with file-based routing
- Hono API mounted under `/api`
- Drizzle ORM with Turso / libSQL
- Cloudflare Workers deployment via Wrangler
- shadcn/ui on the Base UI registry
- Tailwind CSS v4
- Vitest + Testing Library
- Interactive `bun run setup` for app rename and Turso configuration

## Tech Stack

| Layer         | Technology                        |
| ------------- | --------------------------------- |
| App framework | TanStack Start                    |
| API           | Hono                              |
| Database      | Turso + Drizzle ORM               |
| Runtime       | Cloudflare Workers                |
| UI            | React 19 + shadcn/ui (Base UI)    |
| Styling       | Tailwind CSS v4                   |
| Tooling       | Bun, Vite+, oxlint, oxfmt, Vitest |

## Quick Start

```bash
npx degit yicru/u-stacks/shadow my-app
cd my-app
bun install
bun run setup
bun run db:migrate
bun run dev
```

Open `http://localhost:3000` after the dev server starts.

## Setup Flow

`bun run setup` updates the app name across the template and can also guide you through Turso setup.

During setup you can:

- rename the project
- create a new Turso database or connect to an existing one
- choose a Turso group from a detected list or enter one manually
- write `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` into `.dev.vars`
- optionally copy the same credentials into `.dev.vars.production`

If you skip the Turso step, create `.dev.vars` yourself before running database commands or starting local development.

Example `.dev.vars`:

```bash
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your-auth-token
```

## Available Commands

| Command                   | Description                                            |
| ------------------------- | ------------------------------------------------------ |
| `bun run setup`           | Initialize the template and optionally configure Turso |
| `bun run dev`             | Start the local dev server on port 3000                |
| `bun run build`           | Build for production                                   |
| `bun run preview`         | Build and preview the production output                |
| `bun run test`            | Run tests with Vitest                                  |
| `bun run lint`            | Run typecheck, lint, and format checks                 |
| `bun run format`          | Apply lint fixes and formatting                        |
| `bun run db:generate`     | Generate Drizzle migrations from schema changes        |
| `bun run db:migrate`      | Push schema changes using `.dev.vars`                  |
| `bun run db:migrate:prod` | Push schema changes using `.dev.vars.production`       |
| `bun run db:studio`       | Open Drizzle Studio                                    |
| `bun run generate:module` | Scaffold a new server module via Scaffdog              |
| `bun run deploy`          | Build and deploy to Cloudflare Workers                 |
| `bun run cf-typegen`      | Regenerate Wrangler environment types                  |

## Project Structure

```text
shadow/
├── src/
│   ├── routes/          # TanStack Start routes
│   ├── features/        # Feature UI modules
│   ├── components/ui/   # shadcn/ui (Base UI)
│   └── lib/             # Client utilities and API client
├── server/
│   ├── modules/         # Hono modules (controller/service/model)
│   ├── db/              # Drizzle schema and database setup
│   └── lib/             # Shared server utilities
├── scripts/             # Template setup scripts
├── drizzle.config.ts
├── vitest.config.ts
└── wrangler.jsonc
```

## Deployment

Production deploys use `.dev.vars.production` via `dotenvx`:

```bash
bun run deploy
```

Make sure production credentials are prepared before deploying or running `bun run db:migrate:prod`.

## Notes

- Package manager: `bun`
- The project pins `@libsql/client` to `0.15.15` for Cloudflare Workers compatibility
- `src/` must not import from `server/` directly; use the typed Hono client instead
- `worker-configuration.d.ts` and `src/routeTree.gen.ts` are generated files

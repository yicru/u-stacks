# Shadow Stack

A full-stack starter built with TanStack Start, Effect HTTP API, Drizzle, Turso, and Cloudflare Workers.

Shadow is designed for edge-first applications with a runtime-validated API contract shared by the server and browser client.

## Features

- TanStack Start with file-based routing
- Effect HTTP API mounted under `/api`
- Shared Effect Schema for request, response, and error contracts
- Effect `Context.Service` and Layer-based services
- Generated `HttpApiClient` for type-safe browser calls
- Drizzle ORM with Turso / libSQL
- Cloudflare Workers deployment via Wrangler
- shadcn/ui on the Base UI registry
- Tailwind CSS v4
- Vitest integration, service, contract, and client tests
- Interactive `bun run setup` for app rename and Turso configuration

## Tech Stack

| Layer         | Technology                        |
| ------------- | --------------------------------- |
| App framework | TanStack Start                    |
| API           | Effect HTTP API + Effect Schema   |
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

Open `https://my-app.localhost` after the dev server starts. On first run, portless may ask to trust a local development CA.

## Setup Flow

`bun run setup` updates the app name across the template and can guide you through Turso setup.

During setup you can:

- rename the project
- update the portless local app name
- create a new Turso database or connect to an existing one
- choose a Turso group from a detected list or enter one manually
- write `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` into `.dev.vars`
- optionally copy the same credentials into `.dev.vars.production`

If you skip the Turso step, create `.dev.vars` before running database commands or local development.

```bash
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your-auth-token
```

## Available Commands

| Command                   | Description                                                 |
| ------------------------- | ----------------------------------------------------------- |
| `bun run setup`           | Initialize the template and optionally configure Turso      |
| `bun run dev`             | Start the local dev server through portless                 |
| `bun run build`           | Build for production                                        |
| `bun run preview`         | Build and preview the production output                     |
| `bun run test`            | Run tests with Vitest                                       |
| `bun run lint`            | Run typecheck, lint, and format checks                      |
| `bun run format`          | Apply lint fixes and formatting                             |
| `bun run db:generate`     | Generate Drizzle migrations from schema changes             |
| `bun run db:migrate`      | Push schema changes using `.dev.vars`                       |
| `bun run db:migrate:prod` | Push schema changes using `.dev.vars.production`            |
| `bun run db:studio`       | Open Drizzle Studio                                         |
| `bun run generate:module` | Scaffold an Effect API contract, handler, service, and test |
| `bun run deploy`          | Build and deploy to Cloudflare Workers                      |
| `bun run cf-typegen`      | Regenerate Wrangler environment types                       |

## Project Structure

```text
shadow/
├── shared/api/          # Effect Schema and HttpApi contract
├── src/
│   ├── routes/          # TanStack Start routes and /api bridge
│   ├── features/        # Feature UI modules
│   ├── components/ui/   # shadcn/ui (Base UI)
│   └── lib/             # HttpApiClient and browser utilities
├── server/
│   ├── modules/         # HttpApiBuilder handlers and Effect services
│   ├── db/              # Database Tag, Live Layer, and Drizzle schema
│   ├── handler.ts       # Effect API Web handler factory
│   └── index.ts         # Production Layer composition
├── scripts/
│   └── setup.ts
├── drizzle.config.ts
├── vitest.config.ts
└── wrangler.jsonc
```

## API Architecture

`shared/api` is the source of truth. The server uses the contract with `HttpApiBuilder`, while the browser creates its client with `HttpApiClient.make`. Request and response validation therefore use the same Effect Schema on both sides.

Services depend on `Database` through `Context.Service`. Production implementations are assembled with Layer, while tests inject an in-memory database or a test service Layer.

See `server/modules/README.md` for module design and registration rules.

## Deployment

Production deploys use `.dev.vars.production` via `dotenvx`:

```bash
bun run deploy
```

Prepare production credentials before deploying or running `bun run db:migrate:prod`.

## Notes

- Package manager: `bun`
- `@libsql/client` is pinned to `0.17.4`, which uses native `fetch` in Cloudflare Workers
- `src/` must not import `server/` runtime modules; use the shared contract and `HttpApiClient`
- The only bridge exception is `src/routes/api/$.ts`, which forwards Web requests to the server handler
- `worker-configuration.d.ts` and `src/routeTree.gen.ts` are generated files

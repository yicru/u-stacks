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
- React Doctor diagnostics and Fallow structural quality gates
- Interactive `bun run setup` for app rename and Turso configuration

## Tech Stack

| Layer         | Technology                                              |
| ------------- | ------------------------------------------------------- |
| App framework | TanStack Start                                          |
| API           | Effect HTTP API + Effect Schema                         |
| Database      | Turso + Drizzle ORM                                     |
| Runtime       | Cloudflare Workers                                      |
| UI            | React 19 + shadcn/ui (Base UI)                          |
| Styling       | Tailwind CSS v4                                         |
| Tooling       | Bun, Vite+, oxlint, oxfmt, Vitest, React Doctor, Fallow |

## Quick Start

```bash
brew install tursodatabase/tap/turso
npx degit yicru/u-stacks/shadow my-app
cd my-app
bun install
bun run setup
bun run db:migrate
bun run dev
```

Open `https://my-app.localhost` after the dev server starts. On first run, portless may ask to trust a local development CA. Named worktrees receive Portless's branch prefix; detached worktrees receive a stable suffix derived from the worktree ID.

## Setup Flow

`bun run setup` updates the app name across the template and prepares the local Turso environment.

During setup you can:

- rename the project
- update the portless local app name
- write the local Turso URL into `.dev.vars`
- optionally create a production Turso database or connect to an existing one
- choose a Turso group from a detected list or enter one manually
- write production credentials into `.dev.vars.production`

Local development does not use a remote Turso database. The generated `.dev.vars` contains:

```bash
TURSO_DATABASE_URL=http://127.0.0.1:8080
TURSO_AUTH_TOKEN=
```

`bun run db:migrate` and `bun run db:studio` always access `.turso/dev.db` directly. `bun run dev` starts `turso dev --db-file .turso/dev.db`, waits for it to accept connections, and then starts the application. It uses port `8080` when available and selects a free port otherwise. `bun run preview` uses the same local Turso supervisor and builds before starting the preview server. The local database persists across restarts and is ignored by Git.

## Available Commands

| Command                   | Description                                                 |
| ------------------------- | ----------------------------------------------------------- |
| `bun run setup`           | Initialize the template and optionally configure Turso      |
| `bun run dev`             | Start local Turso and the app through portless              |
| `bun run build`           | Build for production                                        |
| `bun run preview`         | Start local Turso, build, and preview the production output |
| `bun run test`            | Run tests with Vitest                                       |
| `bun run lint`            | Run typecheck, lint, and format checks                      |
| `bun run format`          | Apply lint fixes and formatting                             |
| `bun run doctor`          | Scan React code for correctness and design issues           |
| `bun run fallow`          | Report dead code, duplication, and complexity               |
| `bun run fallow:audit`    | Gate newly introduced structural issues                     |
| `bun run quality`         | Run lint, tests, React Doctor, and the full Fallow scan     |
| `bun run db:generate`     | Generate Drizzle migrations from schema changes             |
| `bun run db:migrate`      | Push schema changes to `.turso/dev.db`                      |
| `bun run db:migrate:prod` | Push schema changes using `.dev.vars.production`            |
| `bun run db:studio`       | Open Drizzle Studio for `.turso/dev.db`                     |
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
│   ├── dev.ts
│   └── setup.ts
├── drizzle.config.ts
├── drizzle.production.config.ts
├── vitest.config.ts
└── wrangler.jsonc
```

## API Architecture

`shared/api` is the source of truth. The server uses the contract with `HttpApiBuilder`, while the browser creates its client with `HttpApiClient.make`. Request and response validation therefore use the same Effect Schema on both sides.

Services depend on `Database` through `Context.Service`. Production implementations are assembled with Layer, while tests inject an in-memory database or a test service Layer.

See `server/modules/README.md` for module design and registration rules.

## Deployment

Production deploys use `.dev.vars.production` via `dotenvx` and upload its values as Worker secrets:

```bash
bun run deploy
```

Prepare `.dev.vars.production` before deploying or running `bun run db:migrate:prod`. Production migrations use `drizzle.production.config.ts`; local database commands never read production Turso credentials.

## Notes

- Package manager: `bun`
- `@libsql/client` is pinned to `0.17.4`, which uses native `fetch` in Cloudflare Workers
- `src/` must not import `server/` runtime modules; use the shared contract and `HttpApiClient`
- The only bridge exception is `src/routes/api/$.ts`, which forwards Web requests to the server handler
- `worker-configuration.d.ts` and `src/routeTree.gen.ts` are generated files

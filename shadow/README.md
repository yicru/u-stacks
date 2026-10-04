# Shadow Stack

A full-stack starter built with TanStack Start, Effect HTTP API, Drizzle, Turso, and Cloudflare Workers.

Shadow is designed for edge-first applications with a runtime-validated API contract shared by the server and browser client.

## Features

- TanStack Start with file-based routing
- Effect v4 stable with HTTP API mounted under `/api`
- Shared Effect Schema for request, response, and error contracts
- Effect `Context.Service` and Layer-based services
- Generated `HttpApiClient` for type-safe browser calls
- Drizzle ORM with Turso / libSQL
- Cloudflare Workers deployment via the cf CLI (beta)
- shadcn/ui on the Base UI registry
- Tailwind CSS v4
- Vitest integration, service, contract, and client tests
- React Doctor diagnostics and Fallow structural quality gates
- Interactive `bun run setup` for app rename, Turso, and Cloudflare configuration

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

Use Node.js 22.18 or later and Bun. cf loads TypeScript configuration with Node.js; dependency management and project scripts use Bun.

```bash
brew install tursodatabase/tap/turso
npx degit yicru/u-stacks/shadow my-app
cd my-app
bun install
bun run setup
bun run db:migrate
bun run dev
```

Open `https://my-app.localhost:1355` after the dev server starts. The template uses Portless's unprivileged port `1355` by default, so local startup does not require `sudo`, including from non-interactive task runners. On first run, Portless may ask to trust a local development CA. Named worktrees receive Portless's branch prefix; detached worktrees receive a stable suffix derived from the worktree ID.

Set `PORTLESS_PORT` to override the proxy port. For example, `PORTLESS_PORT=443 bun run dev` uses a URL without a port number, but port `443` must be available and may require `sudo` on macOS or Linux.

## Setup Flow

`bun run setup` updates the app name, prepares Turso, and optionally configures Cloudflare deployment.

During setup you can:

- rename the project
- update the portless local app name
- write the local Turso URL into `.dev.vars`
- register `.dev.vars`, `.dev.vars.production`, and `.cloudflare.json` in `.worktreeinclude`
- register the T3 Code worktree setup action in `t3.json`
- optionally create a production Turso database or connect to an existing one
- choose a Turso group from a detected list or enter one manually
- write production credentials into `.dev.vars.production`
- create or select a named cf profile for this project
- select a Cloudflare account reachable by that profile
- pin the profile and account for future Cloudflare commands

Setup intentionally does not create Cloudflare resources or API tokens. Resource requirements can be added to `cloudflare.config.ts` as the application develops, then reviewed and applied separately.

Setup writes `.worktreeinclude` at the Git repository root so ignored local files can be copied into Codex, Claude Code, and compatible worktrees. It registers `.dev.vars`, `.dev.vars.production`, and `.cloudflare.json`. In a monorepo, entries include the app's repository-relative directory, while a standalone app uses root-relative entries. Existing patterns are preserved and repeated setup is idempotent.

Setup also creates or updates the Git root `t3.json` without removing existing project settings or scripts. Its worktree creation action calls a small runner with three ordered steps: apply `.worktreeinclude`, run `bun install --frozen-lockfile`, and prepare `.repos/effect` at the tag matching the installed Effect package. Each operation remains in its own helper script. The runner uses the Node.js, Bun, and Git installations already required by the project, so no additional CLI is required. Included-file copying is limited to untracked files that are ignored by Git, skips symbolic links, and never overwrites an existing worktree file. Effect source setup preserves local changes instead of switching versions over them.

If the repository was already open in T3 Code, import the updated project scripts after setup.

Local development does not use a remote Turso database. The generated `.dev.vars` contains:

```bash
TURSO_DATABASE_URL=http://127.0.0.1:8080
TURSO_AUTH_TOKEN=
```

`bun run db:migrate` and `bun run db:studio` always access `.turso/dev.db` directly. `bun run dev` starts `turso dev --db-file .turso/dev.db`, waits for it to accept connections, and then starts the application. It uses port `8080` when available and selects a free port otherwise. `bun run preview` uses the same local Turso supervisor and builds before starting the preview server. The local database persists across restarts and is ignored by Git.

## Available Commands

| Command                             | Description                                                  |
| ----------------------------------- | ------------------------------------------------------------ |
| `bun run setup`                     | Initialize and optionally configure Turso and Cloudflare     |
| `bun run dev`                       | Start local Turso and the app through portless on port 1355  |
| `bun run build`                     | Build for production                                         |
| `bun run preview`                   | Start local Turso, build, and preview the production output  |
| `bun run test`                      | Run tests with Vitest                                        |
| `bun run lint`                      | Run typecheck, lint, and format checks                       |
| `bun run format`                    | Apply lint fixes and formatting                              |
| `bun run cloudflare -- status`      | Check login, account, and resource readiness                 |
| `bun run cloudflare -- plan`        | Preview required resource creates and permissions            |
| `bun run cloudflare -- apply --yes` | Create resources and save IDs in `cloudflare.resources.json` |
| `bun run cloudflare -- …`           | Run cf with the configured profile and account               |
| `bun run doctor`                    | Scan React code for correctness and design issues            |
| `bun run fallow`                    | Report dead code, duplication, and complexity                |
| `bun run fallow:audit`              | Gate newly introduced structural issues                      |
| `bun run quality`                   | Run lint, tests, React Doctor, and the full Fallow scan      |
| `bun run db:generate`               | Generate Drizzle migrations from schema changes              |
| `bun run db:migrate`                | Push schema changes to `.turso/dev.db`                       |
| `bun run db:migrate:prod`           | Push schema changes using `.dev.vars.production`             |
| `bun run db:studio`                 | Open Drizzle Studio for `.turso/dev.db`                      |
| `bun run generate:module`           | Scaffold an Effect API contract, handler, service, and test  |
| `bun run deploy`                    | Build and deploy to Cloudflare Workers                       |
| `bun run cf-typegen`                | Generate `.cloudflare/types/index.d.ts`                      |

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
└── cloudflare.config.ts
```

## API Architecture

`shared/api` is the source of truth. The server uses the contract with `HttpApiBuilder`, while the browser creates its client with `HttpApiClient.make`. Request and response validation therefore use the same Effect Schema on both sides.

Services depend on `Database` through `Context.Service`. Production implementations are assembled with Layer, while tests inject an in-memory database or a test service Layer.

See `server/modules/README.md` for module design and registration rules.

## Deployment

Production deploys use `.dev.vars.production` via `dotenvx` and upload its values as Worker secrets. Setup writes the machine-local profile and account selection to `.cloudflare.json`, activates that named cf profile for the project directory, and sets the same `accountId` in `cloudflare.config.ts`. cf has its own credential store, so an existing Wrangler login must be authenticated again with cf. Setup guides that sign-in when needed.

### Cloudflare resource flow

Add bindings to `worker.env` inside `withCloudflareResourceIds()` in `cloudflare.config.ts`. The template declares its two Turso values with `bindings.secret()`; secret values stay in `.dev.vars` and `.dev.vars.production`. KV, D1, and R2 can omit their identifiers during local development:

```ts
env: {
  TURSO_DATABASE_URL: bindings.secret(),
  TURSO_AUTH_TOKEN: bindings.secret(),
  CACHE: bindings.kv({}),
  DB: bindings.d1({ name: 'my-app-db' }),
  ASSETS: bindings.r2({}),
},
```

Then use the explicit lifecycle:

```bash
bun run cloudflare -- status
bun run cloudflare -- plan
bun run cloudflare -- apply --yes
bun run deploy
```

`status` checks authentication and reports unresolved bindings. `plan` runs locally and shows the pinned account, mode, exact creates, and required write permissions. `apply --yes` uses that named cf profile to create KV namespaces, D1 databases, and R2 buckets. Each returned identifier is saved immediately in `cloudflare.resources.json`, scoped by account ID and Worker name. `withCloudflareResourceIds()` loads those identifiers into the typed configuration on future runs. Commit this identifier file with the configuration after applying; it contains resource identifiers, not credentials.

`apply` never deletes resources or rolls back completed creates. Removing or renaming a binding preserves the previous remote resource. Unsupported drafts must be created or adopted explicitly and given identifiers in `cloudflare.config.ts`.

The guarded deploy builds with Vite+, validates the actual `.cloudflare/output/v0` artifacts against the pinned account, Worker, and mode, checks unresolved bindings, and passes the validated output to `cf deploy --prebuilt`. It also checks named resources such as R2 buckets and Queues exist before deployment, since cf can otherwise auto-provision them. Deployment and resource creation remain separate operations. The wrapper supports this deploy flow; preview and version uploads need their own guarded workflow before use.

Use `--mode staging` instead of Wrangler's `--env staging`. Return a complete configuration for each mode, including a distinct Worker name when resources should be separate. The wrapper defaults to `production`:

```bash
bun run cloudflare -- plan --mode staging
bun run cloudflare -- apply --yes --mode staging
bun run cloudflare -- deploy --mode staging --secrets-file .dev.vars.production
```

All remote cf commands should use the wrapper to pass the named profile explicitly and require matching account IDs:

```bash
bun run cloudflare -- workers deployments list my-app
bun run cloudflare -- workers tail my-app
```

`.cloudflare.json` contains no credentials and is ignored by Git because profile names are machine-local. OAuth credentials remain in cf's own credential store. The wrapper rejects ambient `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_API_KEY`, and `CLOUDFLARE_EMAIL`, including legacy `CF_*` aliases, and prevents `.env` credentials from overriding the selected profile.

Vite+ remains the dev, build, and preview runner. cf currently detects this framework and delegates to `bunx vite`, which cannot run the template's Vite+ core alias. `bun run build` uses the cf-compatible Vite plugin to produce Build Output, and the guarded deploy consumes it without a second build. Type generation uses `cf workers types`; `bun run lint` regenerates types before checking the project. `.cloudflare/` holds ignored generated output and types.

See the official [Wrangler migration guide](https://developers.cloudflare.com/cf/wrangler/migrate/) and [programmatic configuration reference](https://developers.cloudflare.com/cf/projects/cloudflare-config/). cf and Vite plugin v2 are currently beta; this template pins the verified versions.

Do not create a broad API token during initial setup. If CI or release automation is introduced later, create a separate account-scoped token at that point with only the resource write capabilities shown by `plan` plus Workers Scripts write for deployment, and keep it in the automation provider's secret store. The current local wrapper is intentionally named-profile-only; token-based automation should be added as a separate execution mode rather than placed in `.cloudflare.json` or `.dev.vars.production`.

Prepare `.dev.vars.production` before deploying or running `bun run db:migrate:prod`. Production migrations use `drizzle.production.config.ts`; local database commands never read production Turso credentials. `.dev.vars.production` is the only file uploaded with `--secrets-file`; `.cloudflare.json` is never uploaded as a Worker secret.

## Notes

- Package manager: `bun`
- `@libsql/client` is pinned to `0.17.4`, which uses native `fetch` in Cloudflare Workers
- `src/` must not import `server/` runtime modules; use the shared contract and `HttpApiClient`
- The only bridge exception is `src/routes/api/$.ts`, which forwards Web requests to the server handler
- `.cloudflare/types/index.d.ts` and `src/routeTree.gen.ts` are generated files

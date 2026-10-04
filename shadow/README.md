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
- Cloudflare Workers deployment via Wrangler
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
- create or select a named Wrangler profile for this project
- select a Cloudflare account reachable by that profile
- pin the profile and account for future Cloudflare commands

Setup intentionally does not create Cloudflare resources or API tokens. Resource requirements can be added to `wrangler.jsonc` as the application develops, then reviewed and applied separately.

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

| Command                             | Description                                                 |
| ----------------------------------- | ----------------------------------------------------------- |
| `bun run setup`                     | Initialize and optionally configure Turso and Cloudflare    |
| `bun run dev`                       | Start local Turso and the app through portless on port 1355 |
| `bun run build`                     | Build for production                                        |
| `bun run preview`                   | Start local Turso, build, and preview the production output |
| `bun run test`                      | Run tests with Vitest                                       |
| `bun run lint`                      | Run typecheck, lint, and format checks                      |
| `bun run format`                    | Apply lint fixes and formatting                             |
| `bun run cloudflare -- status`      | Check login, account, and resource readiness                |
| `bun run cloudflare -- plan`        | Preview required resource creates and permissions           |
| `bun run cloudflare -- apply --yes` | Create reviewed resources and update `wrangler.jsonc`       |
| `bun run cloudflare -- …`           | Run Wrangler with the configured profile and account        |
| `bun run doctor`                    | Scan React code for correctness and design issues           |
| `bun run fallow`                    | Report dead code, duplication, and complexity               |
| `bun run fallow:audit`              | Gate newly introduced structural issues                     |
| `bun run quality`                   | Run lint, tests, React Doctor, and the full Fallow scan     |
| `bun run db:generate`               | Generate Drizzle migrations from schema changes             |
| `bun run db:migrate`                | Push schema changes to `.turso/dev.db`                      |
| `bun run db:migrate:prod`           | Push schema changes using `.dev.vars.production`            |
| `bun run db:studio`                 | Open Drizzle Studio for `.turso/dev.db`                     |
| `bun run generate:module`           | Scaffold an Effect API contract, handler, service, and test |
| `bun run deploy`                    | Build and deploy to Cloudflare Workers                      |
| `bun run cf-typegen`                | Regenerate Wrangler environment types                       |

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

Production deploys use `.dev.vars.production` via `dotenvx` and upload its values as Worker secrets. The setup flow writes the machine-local profile and account selection to `.cloudflare.json`, activates that named Wrangler profile for the project directory, and pins the same `account_id` in `wrangler.jsonc`.

### Cloudflare resource flow

Add resource bindings when they become necessary. KV, D1, and R2 bindings can omit their remote identifier while local development is in progress:

```jsonc
{
  "kv_namespaces": [{ "binding": "CACHE" }],
  "d1_databases": [{ "binding": "DB", "database_name": "my-app-db" }],
  "r2_buckets": [{ "binding": "ASSETS" }],
}
```

Then use the explicit lifecycle:

```bash
bun run cloudflare -- status
bun run cloudflare -- plan
bun run cloudflare -- apply --yes
bun run deploy
```

`status` performs a read-only authentication check and reports unresolved resources. `plan` is local-only: it shows the pinned target, exact creates, and the write capabilities an eventual API token would need. `apply --yes` creates only the reviewed KV namespaces, D1 databases, and R2 buckets through Wrangler's named profile, then lets Wrangler write their identifiers back to `wrangler.jsonc`.

`apply` never deletes resources and never rolls back completed creates. Removing or renaming a binding does not delete the old remote resource. Queue, Dispatch Namespace, Flagship, and other resource drafts that this flow cannot safely update are reported as blockers; create or adopt those explicitly and record their identifiers before deployment.

Deployment refuses unresolved resources and disables Wrangler's automatic provisioning flags, so a normal deploy cannot silently create account resources. Resource creation and Worker deployment therefore remain separate approvals.

```bash
bun run deploy
```

All remote Wrangler commands should use the guarded wrapper so the selected profile is passed explicitly and the two account IDs must match:

```bash
bun run cloudflare -- deployments list
bun run cloudflare -- tail
```

`.cloudflare.json` contains no credentials and is ignored by Git because profile names are machine-local. OAuth credentials remain in Wrangler's own credential store. The wrapper rejects ambient `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_API_KEY`, and `CLOUDFLARE_EMAIL` values, including their legacy `CF_*` aliases, and prevents Wrangler-loaded env files from silently overriding the configured named profile.

Do not create a broad API token during initial setup. If CI or release automation is introduced later, create a separate account-scoped token at that point with only the resource write capabilities shown by `plan` plus Workers Scripts write for deployment, and keep it in the automation provider's secret store. The current local wrapper is intentionally named-profile-only; token-based automation should be added as a separate execution mode rather than placed in `.cloudflare.json` or `.dev.vars.production`.

Prepare `.dev.vars.production` before deploying or running `bun run db:migrate:prod`. Production migrations use `drizzle.production.config.ts`; local database commands never read production Turso credentials. `.dev.vars.production` is the only file uploaded with `--secrets-file`; `.cloudflare.json` is never uploaded as a Worker secret.

## Notes

- Package manager: `bun`
- `@libsql/client` is pinned to `0.17.4`, which uses native `fetch` in Cloudflare Workers
- `src/` must not import `server/` runtime modules; use the shared contract and `HttpApiClient`
- The only bridge exception is `src/routes/api/$.ts`, which forwards Web requests to the server handler
- `worker-configuration.d.ts` and `src/routeTree.gen.ts` are generated files

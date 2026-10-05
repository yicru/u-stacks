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
- Questionnaire and chat primitives, with Base UI Toast notifications
- Effect and shadcn project skills included in `.agents/skills`
- Tailwind CSS v4
- Vitest integration, service, contract, and client tests
- React Doctor diagnostics and Fallow structural quality gates
- Interactive `pnpm run setup` for app rename, Turso, and Cloudflare configuration

## Tech Stack

| Layer         | Technology                                                           |
| ------------- | -------------------------------------------------------------------- |
| App framework | TanStack Start                                                       |
| API           | Effect HTTP API + Effect Schema                                      |
| Database      | Turso + Drizzle ORM                                                  |
| Runtime       | Cloudflare Workers                                                   |
| UI            | React 19 + shadcn/ui (Base UI)                                       |
| Styling       | Tailwind CSS v4                                                      |
| Tooling       | pnpm 12.9.1, Vite+ 1.0, TypeScript 7, Vitest 5, React Doctor, Fallow |

## Quick Start

Install [pnpm](https://pnpm.io/installation) and use a supported Node.js version: 22.22.2 or later in the 22.x series, 24.15.0 or later in the 24.x series, or 26.x and later. These versions satisfy Vite+ and jsdom and support native TypeScript execution for the helper scripts and cf configuration. `packageManager` and Vite+'s `devEngines.packageManager` pin pnpm 12.9.1.

`pnpm-lock.yaml` is the dependency lockfile. The app-local `pnpm-workspace.yaml` configures this single template's overrides, security patches, and permitted dependency builds. Keep both files with the template when copying it; the other stacks remain independent. Script arguments follow the script name directly, for example `pnpm run cloudflare plan --mode staging`.

pnpm enforces a 24-hour release delay and `trustPolicy: no-downgrade`. `minimumReleaseAgeExclude` lists only five existing versions carried over and verified during migration, so fresh checkouts can install them immediately; future versions still follow the delay. `allowBuilds` permits the verified versions of esbuild, workerd, and msgpackr-extract to prepare their native binaries. Review those entries when updating the corresponding dependencies.

`trustPolicyExclude` accepts only the existing `semver@6.3.1` maintenance release, published in July 2023. pnpm flags its publication metadata as a trust downgrade. Its locked tarball integrity matches the npm registry, and the [official release](https://github.com/npm/node-semver/releases/tag/v6.3.1) confirms this legacy version; keeping this exact exception preserves consumers that require semver 6 without allowing future versions to bypass trust checks.

```bash
brew install tursodatabase/tap/turso
npx degit yicru/u-stacks/shadow my-app
cd my-app
pnpm --version
pnpm install --frozen-lockfile
pnpm run setup
pnpm run db:migrate
pnpm run dev
```

Open `https://my-app.localhost:1355` after the dev server starts. The template uses Portless's unprivileged port `1355` by default, so local startup does not require `sudo`, including from non-interactive task runners. On first run, Portless may ask to trust a local development CA. Named worktrees receive Portless's branch prefix; detached worktrees receive a stable suffix derived from the worktree ID.

Set `PORTLESS_PORT` to override the proxy port. For example, `PORTLESS_PORT=443 pnpm run dev` uses a URL without a port number, but port `443` must be available and may require `sudo` on macOS or Linux.

## Setup Flow

`pnpm run setup` updates the app name, prepares Turso, and optionally configures Cloudflare deployment.

During setup you can:

- rename the project
- update the portless local app name
- write the local Turso URL into `.dev.vars`
- register `.dev.vars`, `.dev.vars.production`, and `.cloudflare.json` in `.worktreeinclude`
- register the T3 Code worktree setup action in `t3.json`
- optionally create a production Turso database or connect to an existing one
- choose a Turso group from a detected list or enter one manually
- write production credentials into `.dev.vars.production`
- pin the production database hostname in `turso.production.json`
- create or select a named cf profile for this project
- select a Cloudflare account reachable by that profile
- pin the profile and account for future Cloudflare commands

Setup intentionally does not create Cloudflare resources or API tokens. Resource requirements can be added to `cloudflare.config.ts` as the application develops, then reviewed and applied separately.

Setup writes `.worktreeinclude` at the Git repository root so ignored local files can be copied into Codex, Claude Code, and compatible worktrees. It registers `.dev.vars`, `.dev.vars.production`, and `.cloudflare.json`. In a monorepo, entries include the app's repository-relative directory, while a standalone app uses root-relative entries. Existing patterns are preserved and repeated setup is idempotent.

Setup also creates or updates the Git root `t3.json` without removing existing project settings or scripts. Its worktree creation action calls a small runner with three ordered steps: apply `.worktreeinclude`, run `pnpm install --frozen-lockfile`, and prepare `.repos/effect` at the tag matching the installed Effect package. Each operation remains in its own helper script. The runner uses the Node.js, pnpm, and Git installations already required by the project, so no additional CLI is required. Included-file copying is limited to untracked files that are ignored by Git, skips symbolic links, and never overwrites an existing worktree file. Effect source setup preserves local changes instead of switching versions over them.

If the repository was already open in T3 Code, import the updated project scripts after setup.

Local development does not use a remote Turso database. The generated `.dev.vars` contains:

```bash
TURSO_DATABASE_URL=http://127.0.0.1:8080
TURSO_AUTH_TOKEN=
```

`pnpm run db:migrate` and `pnpm run db:studio` always access `.turso/dev.db` directly. `pnpm run dev` starts `turso dev --db-file .turso/dev.db`, waits for it to accept connections, and then starts the application. It uses port `8080` when available and selects a free port otherwise. `pnpm run preview` uses the same local Turso supervisor and builds before starting the preview server. The local database persists across restarts and is ignored by Git.

## Available Commands

| Command                           | Description                                                  |
| --------------------------------- | ------------------------------------------------------------ |
| `pnpm run setup`                  | Initialize and optionally configure Turso and Cloudflare     |
| `pnpm run dev`                    | Start local Turso and the app through portless on port 1355  |
| `pnpm run build`                  | Build for production                                         |
| `pnpm run preview`                | Start local Turso, build, and preview the production output  |
| `pnpm run test`                   | Run tests with Vitest                                        |
| `pnpm run lint`                   | Run typecheck, lint, and format checks                       |
| `pnpm run format`                 | Apply lint fixes and formatting                              |
| `pnpm run cloudflare status`      | Check login, account, and resource readiness                 |
| `pnpm run cloudflare plan`        | Preview required resource creates and permissions            |
| `pnpm run cloudflare apply --yes` | Create resources and save IDs in `cloudflare.resources.json` |
| `pnpm run cloudflare …`           | Run cf with the configured profile and account               |
| `pnpm run doctor`                 | Scan React code for correctness and design issues            |
| `pnpm run fallow`                 | Report dead code, duplication, and complexity                |
| `pnpm run fallow:audit`           | Gate newly introduced structural issues                      |
| `pnpm run quality`                | Run lint, tests, React Doctor, and the full Fallow scan      |
| `pnpm run db:generate`            | Generate Drizzle migrations from schema changes              |
| `pnpm run db:migrate`             | Apply pending SQL migrations to `.turso/dev.db`              |
| `pnpm run db:migrate:prod`        | Apply pending SQL to the pinned production database          |
| `pnpm run db:push`                | Push schema directly to the local database for prototyping   |
| `pnpm run db:studio`              | Open Drizzle Studio for `.turso/dev.db`                      |
| `pnpm run generate:module`        | Scaffold an Effect API contract, handler, service, and test  |
| `pnpm run deploy`                 | Build and deploy to Cloudflare Workers                       |
| `pnpm run cf-typegen`             | Generate `.cloudflare/types/index.d.ts`                      |

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
pnpm run cloudflare status
pnpm run cloudflare plan
pnpm run cloudflare apply --yes
pnpm run deploy
```

`status` checks authentication and reports unresolved bindings. `plan` runs locally and shows the pinned account, mode, exact creates, and required write permissions. `apply --yes` uses that named cf profile to create KV namespaces, D1 databases, and R2 buckets. Each returned identifier is saved immediately in `cloudflare.resources.json`, scoped by account ID and Worker name. `withCloudflareResourceIds()` loads those identifiers into the typed configuration on future runs. Commit this identifier file with the configuration after applying; it contains resource identifiers, not credentials.

`apply` never deletes resources or rolls back completed creates. Removing or renaming a binding preserves the previous remote resource. Unsupported drafts must be created or adopted explicitly and given identifiers in `cloudflare.config.ts`.

The guarded deploy builds with Vite+, validates the actual `.cloudflare/output/v0` artifacts against the pinned account, Worker, and mode, checks unresolved bindings, and passes the validated output to `cf deploy --prebuilt`. It also checks named resources such as R2 buckets and Queues exist before deployment, since cf can otherwise auto-provision them. Deployment and resource creation remain separate operations. The wrapper supports this deploy flow; preview and version uploads need their own guarded workflow before use.

Use `--mode staging` instead of Wrangler's `--env staging`. Return a complete configuration for each mode, including a distinct Worker name when resources should be separate. The wrapper defaults to `production`:

```bash
pnpm run cloudflare plan --mode staging
pnpm run cloudflare apply --yes --mode staging
pnpm run cloudflare deploy --mode staging --secrets-file .dev.vars.production
```

All remote cf commands should use the wrapper to pass the named profile explicitly and require matching account IDs:

```bash
pnpm run cloudflare workers deployments list my-app
pnpm run cloudflare workers tail my-app
```

`.cloudflare.json` contains no credentials and is ignored by Git because profile names are machine-local. OAuth credentials remain in cf's own credential store. The wrapper rejects ambient `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_API_KEY`, and `CLOUDFLARE_EMAIL`, including legacy `CF_*` aliases, and prevents `.env` credentials from overriding the selected profile.

Vite+ remains the dev, build, and preview runner. cf's framework detection invokes the `vite` binary, which is absent from the Vite+ core alias. `pnpm run build` uses the cf-compatible Vite plugin to produce Build Output, and the guarded deploy consumes it without a second build. Type generation uses `cf workers types`; `pnpm run lint` regenerates types before checking the project. `.cloudflare/` holds ignored generated output and types.

See the official [Wrangler migration guide](https://developers.cloudflare.com/cf/wrangler/migrate/) and [programmatic configuration reference](https://developers.cloudflare.com/cf/projects/cloudflare-config/). cf and Vite plugin v2 are currently beta; this template pins the verified versions.

The Worker uses compatibility date `2026-09-30`, matching the workerd release bundled with the pinned Vite plugin. Node.js compatibility is enabled by that date without an explicit flag. Logs are enabled, and traces sample 1% of requests. Review compatibility changes and verify the local Worker when updating the pinned Cloudflare toolchain.

Do not create a broad API token during initial setup. If CI or release automation is introduced later, create a separate account-scoped token at that point with only the resource write capabilities shown by `plan` plus Workers Scripts write for deployment, and keep it in the automation provider's secret store. The current local wrapper is intentionally named-profile-only; token-based automation should be added as a separate execution mode rather than placed in `.cloudflare.json` or `.dev.vars.production`.

Prepare `.dev.vars.production` before deploying. Production migrations also require `turso.production.json` to pin the intended hostname; setup writes this public identifier separately from credentials. `drizzle.production.config.ts` rejects missing tokens, unpinned or mismatched databases, local or insecure URLs, and credentials embedded in URLs before returning connection settings. Local database commands never read production Turso credentials. `.dev.vars.production` is the only file uploaded with `--secrets-file`; `.cloudflare.json` and `turso.production.json` are never uploaded as Worker secrets.

### Database migrations

The template includes the initial SQL migration and Drizzle journal under `drizzle/`. Generate and review SQL with `pnpm run db:generate`, rehearse it locally with `pnpm run db:migrate`, then apply it to the pinned target with `pnpm run db:migrate:prod`. Commit the SQL, snapshots, journal, and `turso.production.json` together with schema changes. Repeating `migrate` applies only pending migrations.

`pnpm run db:push` remains available for local prototyping. Databases created with the previous `push` workflow need a reviewed baseline before using SQL migrations; the included initial migration creates tables in an empty database. See [database migration procedures](docs/database-migrations.md) for fresh databases and existing-data adoption.

## Dependency maintenance

### Effect project skill

`.agents/skills/effect-ts` adapts the official [Effect skill](https://github.com/Effect-TS/skills) for pnpm and stable Effect v4. It directs agents to the installed package's `AGENTS.md`, source, and exports, and uses `scripts/prepare-effect.mjs` when refreshing the optional upstream source mirror after an upgrade. The skill and upstream license are included as real files in standalone `degit` checkouts; `AGENTS.md` points agents to it. It becomes available on the next agent turn.

### shadcn UI

The template includes Questionnaire, MessageScroller, Message, Bubble, Attachment, Marker, and Toast from the official Base UI registry. Notifications use `toast.add({ title, type })` from `@/components/ui/toast`; the root layout mounts `Toaster`. Class names use the `cn` package, also re-exported from `@/lib/utils` for existing components.

The official [shadcn skill](https://ui.shadcn.com/docs/skills) is vendored as real files under `.agents/skills/shadcn`, including its referenced rules and assets. A `degit yicru/u-stacks/shadow my-app` checkout therefore includes the project skill without a global installation or external symlink. Start a new agent session after cloning or updating the skill so it can be discovered; `AGENTS.md` also points agents to it.

Vendored skill examples are excluded from lint, formatting, Fallow, and Tailwind class scanning, so instructions do not add application CSS or source-quality findings.

`@shadcn/lint` is registered in Vite+'s Oxlint configuration through `lint.jsPlugins` in `vite.config.ts`. `shadcn/no-raw-colors` and `shadcn/no-unknown-classes` are enabled as errors: application code uses theme color tokens and classes supported by the installed Tailwind theme. The existing component-source ignores remain in place. Run `pnpm run lint` to enforce this policy; additional [design-system rules](https://github.com/shadcn-ui/lint#rules) can be added to `lint.rules` as needed.

### Dependency checks

```bash
pnpm outdated
pnpm audit
pnpm run quality
pnpm run build
```

Vite+ and its `vite` alias are pinned to the same release. Tests and generated module tests import `vite-plus/test`, so their APIs match the bundled Vitest version. The esbuild override updates the older copy pulled in by Drizzle's config loader; verify `db:generate` alongside the application checks when changing it.

The Vite+ core alias reports package version `1.0.0` while exposing Vite `8.3.1`. The version-scoped `peerDependencyRules.allowedVersions.vite` entry accepts that verified alias for Vite plugins; update it alongside the toolchain pins.

Fallow declares Cloudflare configuration and T3 worktree helper scripts as entry points because the tools load them by filename or subprocess. Portless is retained as the CLI started by `scripts/dev.ts`. `pnpm run fallow` analyzes the full codebase, including inherited duplication and complexity findings. `pnpm run fallow:audit --base <ref>` applies the configured `new-only` gate to a changeset; it does not replace the full analysis in `quality`.

Two development dependencies have advisories without published fixes. The template applies local [pnpm patches](https://pnpm.io/cli/patch) through `patchedDependencies` in `pnpm-workspace.yaml`, recorded in `pnpm-lock.yaml`; `pnpm install --frozen-lockfile` applies them in new checkouts:

- [braces stack exhaustion](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm): `patches/braces@3.0.3.patch` bounds parser nesting and recursive compile, expand, and stringify AST walks to a depth limit of 512. Excessively nested patterns or ASTs raise `SyntaxError`. Ordinary shadcn and scaffdog file patterns retain their behavior.
- [node-forge signature verification](https://github.com/advisories/GHSA-86w9-cpqp-85rv): `patches/node-forge@1.4.0.patch` adds the nested DigestAlgorithm element-count check proposed in [upstream PR #1152](https://github.com/digitalbazaar/forge/pull/1152). RSA PKCS#1 v1.5 verification rejects extra unconsumed elements while accepting supported OID-only and OID-plus-NULL sequences. dotenvx uses this package for its optional proxy certificate generation.

`scripts/dependency-security.test.ts` exercises the installed packages in Node.js, covering malicious inputs and valid behavior. Both regressions fail without the patches. Neither dependency is part of the Worker application. `pnpm audit` still reports both advisories because it checks published version metadata rather than local patch contents; the findings are kept visible. Replace the patches with verified upstream releases when fixes become available, then rerun the regression tests and audit.

Cloudflare resource planning, saved identifier validation, command guards, and local process supervision are split by responsibility. Setup shares its active-pattern scanner for worktree includes and Effect source ignores. Full Fallow analysis passes without changing its thresholds or exclusions.

## Notes

- Package manager: `pnpm`
- `src/` must not import `server/` runtime modules; use the shared contract and `HttpApiClient`
- The only bridge exception is `src/routes/api/$.ts`, which forwards Web requests to the server handler
- `.cloudflare/types/index.d.ts` and `src/routeTree.gen.ts` are generated files

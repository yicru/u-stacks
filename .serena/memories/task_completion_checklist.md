# Task Completion Checklist

## Per-Stack Verification

### tails
1. `npm run format` — Format with Biome
2. `npm run lint` — Lint with Biome
3. `npm run typecheck` — tsc --noEmit
4. `npm run build` — Build verification
5. If auth changes: `npm run better-auth:generate`
6. If DB changes: `npm run db:migrate && npm run db:generate`
7. If Cloudflare env changes: `npm run cf-typegen`

### sonic
1. `npm run format` — Format with Biome
2. `npm run lint` — Lint with Biome
3. `npm run typecheck` — tsc --noEmit
4. `npm run build` — Build verification
5. If DB changes: `npm run db:push`

### shadow
1. `bun run format` — Format with oxlint + oxfmt
2. `bun run lint` — typecheck + oxlint + oxfmt
3. `bun run test` — Run Vitest tests
4. `bun run build` — Build verification
5. If module added: `bun run generate:module`

## Anti-Patterns to Avoid
- Never commit without running format and lint
- Never use `as any`, `@ts-ignore`, `@ts-expect-error`
- Never edit auto-generated files
- shadow: Never use npm, always bun
- shadow: Never import server/ from src/ directly
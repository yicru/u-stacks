# Development Commands

## tails (npm)
```bash
npm run dev            # Dev server
npm run build          # Production build
npm run lint           # Biome check
npm run format         # Biome fix
npm run typecheck      # tsc --noEmit
npm run deploy:production  # Deploy to Cloudflare Pages (OpenNext)
npm run db:migrate     # Run Drizzle migrations
npm run db:generate    # Generate Drizzle client
npm run better-auth:generate  # Generate Better Auth types
npm run cf-typegen     # Generate Cloudflare env types
```

## sonic (npm)
```bash
npm run dev            # Dev server
npm run build          # Production build
npm run lint           # Biome check
npm run format         # Biome fix
npm run typecheck      # tsc --noEmit
npm run deploy         # Deploy to Fly.io
npm run db:push        # Push Prisma schema
```

## shadow (bun — NOT npm)
```bash
bun run dev            # Dev server
bun run build          # Production build
bun run lint           # typecheck + oxlint + oxfmt
bun run format         # oxlint --fix + oxfmt
bun run test           # Vitest
bun run deploy         # Deploy to Cloudflare Workers
bun run generate:module  # scaffdog module CRUD generation
```

## IMPORTANT
- shadow uses `bun` exclusively — never `npm`
- Each stack has its own package.json
- No root-level commands
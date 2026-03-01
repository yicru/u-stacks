# Project Structure

## Root Level
```
u-stacks/
├── tails/                  # Next.js 15 + Radix/shadcn + Better Auth + Drizzle + Cloudflare Pages
├── sonic/                  # React Router v7 + Mantine + Clerk + Fly.io
├── shadow/                 # TanStack Start + shadcn(Base UI) + Drizzle + Cloudflare Workers
├── .github/workflows/      # CI/CD (Sonic deploy only)
└── AGENTS.md               # Per-stack knowledge bases
```

## Tails Stack (`/tails`)
```
├── src/
│   ├── app/                # Next.js App Router pages
│   └── components/ui/      # shadcn/ui components (auto-generated)
├── server/
│   ├── index.ts            # Hono app definition
│   ├── factory.ts          # Hono instance creation
│   ├── routes/             # Domain route handlers
│   ├── db/
│   │   └── auth-schema.ts  # Auto-generated (Better Auth)
│   └── lib/auth.ts         # Better Auth configuration
├── drizzle/                # Drizzle migrations
├── cloudflare-env.d.ts     # Auto-generated (Wrangler)
└── package.json
```

## Sonic Stack (`/sonic`)
```
├── app/                    # React Router routes
├── features/               # Domain-specific logic (task CRUD)
├── server/
│   ├── index.ts            # Hono app definition
│   ├── factory.ts          # Hono instance creation
│   └── routes/             # Domain route handlers
├── lib/                    # Shared utilities
├── prisma/                 # Prisma schema
└── package.json
```

## Shadow Stack (`/shadow`)
```
├── src/
│   ├── routes/             # TanStack Router pages
│   ├── components/ui/      # shadcn/ui (Base UI) components
│   ├── features/           # Domain-specific logic
│   └── routeTree.gen.ts    # Auto-generated (TanStack Router)
├── server/
│   ├── index.ts            # Hono app definition
│   ├── factory.ts          # Hono instance creation
│   └── modules/            # MVC pattern: {name}/index.ts, service.ts, model.ts
├── drizzle/                # Drizzle migrations
├── worker-configuration.d.ts  # Auto-generated (Wrangler)
└── package.json
```

## Auto-Generated Files (DO NOT EDIT)
- `tails/cloudflare-env.d.ts`
- `tails/server/db/auth-schema.ts`
- `shadow/worker-configuration.d.ts`
- `shadow/src/routeTree.gen.ts`
# Project Structure

## Root Level
- `/tails` - Tails Stack (Next.js + Radix UI + Better Auth)
- `/sonic` - Sonic Stack (React Router + Mantine + Clerk)
- `/hono-on-react-router` - Minimal React Router + Hono setup
- `/.github` - GitHub workflows (sonic deployment)
- `/README.md` - Installation instructions

## Tails Stack Structure
```
/tails
├── /src
│   ├── /app - Next.js App Router pages
│   └── /components/ui - shadcn/ui components
├── /server
│   └── /lib/auth.ts - Better Auth configuration
├── /prisma - Database schema
├── /public - Static assets
├── package.json - Dependencies and scripts
├── biome.json - Code formatting config
├── next.config.ts - Next.js configuration
└── open-next.config.ts - Cloudflare deployment config
```

## Sonic Stack Structure
```
/sonic
├── /app - React Router routes
├── /features - Domain-specific logic
├── /server - Hono API server
├── /lib - Shared utilities
├── /prisma - Database schema
├── /public - Static assets
├── main.ts - Server entry point
├── react-router.config.ts - Framework config
├── fly.toml - Fly.io deployment config
└── biome.json - Code formatting config
```

## Hono on React Router Structure
```
/hono-on-react-router
├── /app - React Router routes
├── /server - Hono API routes
├── /prisma - Database schema
├── /public - Static assets
├── react-router.config.ts - Framework config
└── biome.json - Code formatting config
```

## Common Patterns
- API routes in `/server` directories
- Database schemas in `/prisma` directories
- TypeScript configuration in `tsconfig.json`
- Biome formatting in `biome.json`
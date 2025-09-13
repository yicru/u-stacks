# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

U Stacks is a collection of modern full-stack starter templates. The repository contains three different stack options, each in its own directory:

1. **Tails Stack** (`/tails`) - Next.js 15 + Radix UI + Better Auth + Drizzle + Cloudflare
2. **Sonic Stack** (`/sonic`) - React Router v7 + Mantine + Clerk + Fly.io  
3. **Hono on React Router** (`/hono-on-react-router`) - React Router v7 + Hono + Prisma

## Environment Setup

Each stack requires environment variables. Copy `.env.example` to `.env` in the respective stack directory:

**Tails Stack**:
- `TURSO_CONNECTION_URL` - Turso database connection URL
- `TURSO_AUTH_TOKEN` - Turso authentication token
- `BETTER_AUTH_SECRET` - Secret key for Better Auth
- `NEXT_PUBLIC_APP_URL` - Application URL (default: http://localhost:3000)

**Sonic Stack**:
- `DATABASE_URL` - PostgreSQL connection string
- `CLERK_SECRET_KEY` - Clerk backend API key
- `VITE_CLERK_PUBLISHABLE_KEY` - Clerk frontend API key
- `VITE_API_URL` - API endpoint URL (default: http://localhost:5173)

**Hono on React Router**:
- `DATABASE_URL` - PostgreSQL connection string
- `VITE_API_URL` - API endpoint URL (default: http://localhost:5173)

## Common Development Commands

All stacks use Biome for formatting/linting and npm for package management:

```bash
npm run dev        # Start development server
npm run build      # Build for production
npm run lint       # Run Biome linter
npm run format     # Format code with Biome
npm run typecheck  # Type check TypeScript
```

### Database Commands

**Tails Stack**:
- `npm run db:migrate` - Push schema changes to Turso database using Drizzle Kit
- `npm run better-auth:generate` - Generate Better Auth database schema

**Sonic/Hono Stacks**:
- `npm run db:push` - Push Prisma schema changes to database without migration history

### Stack-Specific Commands

**Tails Stack** (Cloudflare deployment):
- `npm run deploy` - Build and deploy to Cloudflare Pages
- `npm run preview` - Build and preview deployment locally
- `npm run cf-typegen` - Generate TypeScript types for Cloudflare environment

**Sonic Stack** (Fly.io deployment):
- `npm run deploy` - Deploy application to Fly.io (requires fly CLI)
- `npm run deploy:db` - Deploy PostgreSQL database to Fly.io

## Database Setup

**Tails Stack**: Uses Turso (libSQL) - a SQLite-compatible edge database
- Create a Turso database: `turso db create <database-name>`
- Get connection URL: `turso db show <database-name> --url`
- Get auth token: `turso db tokens create <database-name>`

**Sonic/Hono Stacks**: Use PostgreSQL
- Local: Run PostgreSQL via Docker or install locally
- Production: Sonic uses Fly.io PostgreSQL, Hono can use any PostgreSQL provider

## Architecture

### Common Patterns
- All stacks use TypeScript and React 19
- Tails uses Drizzle ORM, others use Prisma ORM
- Server code lives in `/server` directories
- Database schemas in `/prisma` directories (except Tails which uses `/server/db`)
- API routes use either Hono or Next.js App Router

### Stack-Specific Architecture

**Tails Stack**:
- Next.js 15 App Router with React Server Components
- `/src/app` for routes, `/src/components/ui` for shadcn/ui components
- Better Auth integration in `/server/lib/auth.ts`
- Drizzle ORM with hand-written schemas in `/server/db/schema.ts`
- Database connection in `/server/lib/drizzle.ts`
- Deployed to Cloudflare Pages via OpenNext

**Sonic Stack**:
- React Router v7 as meta-framework
- Hono server integrated via hono-react-router-adapter
- `/app` for routes, `/features` for domain logic
- Clerk authentication with middleware
- Deployed to Fly.io with PostgreSQL

**Hono on React Router**:
- Minimal React Router v7 + Hono setup
- Similar structure to Sonic but without auth/UI library
- Best for custom implementations

## Code Style

Biome configuration (all stacks):
- 2 space indentation
- 80 character line width  
- Single quotes, ASI (semicolons as needed)
- Sorted Tailwind classes

## Testing and Verification

Before completing any task, always run:
1. `npm run format` - Apply Biome formatting
2. `npm run lint` - Check for linting errors
3. `npm run typecheck` - Verify TypeScript types
4. `npm run build` - Ensure production build succeeds

Ensure the development server runs without errors and check the browser console for any runtime issues.

**Note**: Test frameworks are not configured in these starters. Add your preferred testing solution (Vitest, Jest, etc.) as needed.

## Deployment Prerequisites

**Tails Stack** (Cloudflare):
- Cloudflare account with Pages enabled
- Wrangler CLI installed globally: `npm install -g wrangler`
- Configure wrangler.toml for your project

**Sonic Stack** (Fly.io):
- Fly.io account and CLI: `curl -L https://fly.io/install.sh | sh`
- Initialize Fly app: `fly launch` (only needed once)
- PostgreSQL database created via `npm run deploy:db`

**Hono on React Router**:
- Can be deployed to any Node.js hosting provider
- Uses standard React Router serve for production

## Key Architectural Decisions

**When to use each stack**:

- **Tails Stack**: Best for edge-first applications, serverless deployment, and when you need built-in authentication with minimal setup. Uses React Server Components for optimal performance.

- **Sonic Stack**: Ideal for traditional full-stack applications with PostgreSQL, enterprise authentication (Clerk), and when you need a complete UI component library (Mantine).

- **Hono on React Router**: Choose this for maximum flexibility and minimal dependencies. Best when you want to implement custom authentication and UI components.

**API Design Patterns**:
- Tails: Uses Next.js App Router API routes (`/src/app/api`)
- Sonic/Hono: Uses Hono server with type-safe RPC pattern via hono-react-router-adapter
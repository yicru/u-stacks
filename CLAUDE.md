# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

U Stacks is a collection of modern full-stack starter templates. The repository contains three different stack options, each in its own directory:

1. **Tails Stack** (`/tails`) - Next.js 15 + Radix UI + Better Auth + Cloudflare
2. **Sonic Stack** (`/sonic`) - React Router v7 + Mantine + Clerk + Fly.io  
3. **Hono on React Router** (`/hono-on-react-router`) - React Router v7 + Hono + Prisma

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
- Tails: `npm run db:migrate` then `npm run db:generate`
- Sonic/Hono: `npm run db:push`

### Stack-Specific Commands
- Tails: `npm run deploy` (Cloudflare), `npm run better-auth:generate`
- Sonic: `npm run deploy` (Fly.io), `npm run deploy:db`

## Architecture

### Common Patterns
- All stacks use TypeScript, React 19, and Prisma ORM
- Server code lives in `/server` directories
- Database schemas in `/prisma` directories
- API routes use either Hono or Next.js App Router

### Stack-Specific Architecture

**Tails Stack**:
- Next.js 15 App Router with React Server Components
- `/src/app` for routes, `/src/components/ui` for shadcn/ui components
- Better Auth integration in `/server/lib/auth.ts`
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
1. `npm run format`
2. `npm run lint` 
3. `npm run typecheck`
4. `npm run build`

Ensure the development server runs without errors and check the browser console.
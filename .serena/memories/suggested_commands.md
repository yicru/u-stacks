# Common Development Commands

## For All Stacks

### Development
- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm run start` - Run production build

### Code Quality
- `npm run lint` - Run Biome linter
- `npm run format` - Format code with Biome
- `npm run format:force` - Format with unsafe fixes
- `npm run typecheck` - Type check TypeScript files

### Database
- `npm run db:push` (Sonic, Hono on RR) or `npm run db:migrate` (Tails) - Apply database schema changes
- `npm run db:generate` (Tails only) - Generate Prisma client

## Stack-Specific Commands

### Tails Stack
- `npm run deploy` - Deploy to Cloudflare Pages
- `npm run preview` - Preview Cloudflare deployment
- `npm run cf-typegen` - Generate Cloudflare types
- `npm run better-auth:generate` - Generate Better Auth types

### Sonic Stack
- `npm run deploy` - Deploy to Fly.io
- `npm run deploy:db` - Deploy database to Fly.io
- Uses concurrent dev servers (React Router + tsup)

### Hono on React Router
- Uses concurrent dev servers (React Router + tsup)
- Standard React Router serve for production

## Installation
- All stacks use npm (package-lock.json present)
- Run `npm install` to install dependencies
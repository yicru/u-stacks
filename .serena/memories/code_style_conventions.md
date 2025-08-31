# Code Style and Conventions

## Biome Configuration (All Stacks)
- **Indent**: 2 spaces
- **Line Width**: 80 characters
- **Quotes**: Single quotes
- **Semicolons**: As needed (ASI)
- **Import Organization**: Automatic
- **Sorted Classes**: Enabled for Tailwind (nursery rule)

## File Structure
- TypeScript throughout
- ES modules (`"type": "module"`)
- Component files in appropriate feature directories
- Server code in `/server` directory
- Database schemas in `/prisma` directory

## Naming Conventions
- React components: PascalCase
- Files: kebab-case for routes, PascalCase for components
- Variables/functions: camelCase

## Ignored Files
- `cloudflare-env.d.ts` (Tails)
- `src/components/ui` (Tails - auto-generated shadcn/ui)

## Best Practices
- Use TypeScript strict mode
- Validate with Zod schemas
- Follow React 19 patterns
- Use server components where applicable (Next.js/React Router)
- Keep components small and focused
# Design Patterns and Guidelines

## API Design
- **Tails**: Next.js App Router with Server Actions
- **Sonic/Hono**: RESTful APIs using Hono framework
- Validation with Zod schemas for type safety
- Error handling with try-catch blocks

## Authentication Patterns
- **Tails**: Better Auth with database sessions
- **Sonic**: Clerk with JWT tokens and middleware protection
- Protected routes using middleware or layout components

## Database Patterns
- Prisma ORM for all stacks
- Schema-first approach with `schema.prisma`
- Type-safe queries with generated client
- Migrations handled differently:
  - Tails: `db:migrate` + `db:generate`
  - Sonic/Hono: `db:push` for development

## Component Architecture
- **Tails**: 
  - Server Components by default
  - Client Components with "use client" directive
  - shadcn/ui for consistent UI components
- **Sonic**: 
  - Mantine component library
  - Form handling with mantine-form
- **Hono on RR**: 
  - Custom component implementation
  - Tailwind CSS for styling

## State Management
- Server state preferred (React Router loaders/actions)
- Client state with React hooks when necessary
- Form state with react-hook-form (Tails) or Mantine forms (Sonic)

## File Organization
- Feature-based organization in Sonic (`/features`)
- Route-based organization in Next.js (`/src/app`)
- Shared utilities in `/lib` or `/server/lib`
- Type definitions co-located with features

## Error Handling
- Consistent error boundaries
- Proper HTTP status codes in APIs
- User-friendly error messages
- Logging for debugging (console in dev, structured in prod)
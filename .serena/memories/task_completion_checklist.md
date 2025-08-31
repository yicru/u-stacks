# Task Completion Checklist

When completing any coding task, always run these commands:

1. **Format Code**
   ```bash
   npm run format
   ```

2. **Lint Code**
   ```bash
   npm run lint
   ```

3. **Type Check**
   ```bash
   npm run typecheck
   ```

4. **Verify Development Server**
   - Run `npm run dev` and ensure no runtime errors
   - Check browser console for errors

5. **Database Changes** (if applicable)
   - Tails: `npm run db:migrate` then `npm run db:generate`
   - Sonic/Hono: `npm run db:push`

6. **Authentication Types** (if applicable)
   - Tails: `npm run better-auth:generate` after auth changes
   - Sonic: Clerk types are auto-generated

7. **Build Verification**
   ```bash
   npm run build
   ```

## Important Notes
- Never commit without running format and lint
- Always verify TypeScript compilation
- Test in development before marking task complete
- For Cloudflare (Tails): run `npm run cf-typegen` if env types needed
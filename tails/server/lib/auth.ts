import { db } from '@server/db'
import * as authSchema from '@server/db/auth-schema'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'sqlite',
    schema: authSchema,
    usePlural: true,
  }),
  emailAndPassword: {
    enabled: true,
  },
})

export type AuthType = {
  user: typeof auth.$Infer.Session.user | null
  session: typeof auth.$Infer.Session.session | null
}

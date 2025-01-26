import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string(),
  CLERK_SECRET_KEY: z.string(),
  VITE_CLERK_PUBLISHABLE_KEY: z.string(),
})

export const serverEnv = envSchema.parse(process.env)

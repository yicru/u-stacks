import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  out: './drizzle',
  schema: ['./server/db/schema.ts', './server/db/auth-schema.ts'],
  dialect: 'turso',
  dbCredentials: {
    url: process.env.TURSO_CONNECTION_URL || '',
    authToken: process.env.TURSO_AUTH_TOKEN || '',
  },
})

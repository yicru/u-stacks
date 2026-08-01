import { mkdirSync } from 'node:fs'
import { defineConfig } from 'drizzle-kit'

const databaseUrl = process.env.TURSO_DATABASE_URL ?? 'file:.turso/dev.db'

if (databaseUrl === 'file:.turso/dev.db') {
  mkdirSync('.turso', { recursive: true })
}

export default defineConfig({
  schema: './server/db/schema.ts',
  out: './drizzle',
  dialect: 'turso',
  dbCredentials: {
    url: databaseUrl,
    authToken: process.env.TURSO_AUTH_TOKEN || undefined,
  },
})

import { mkdirSync } from 'node:fs'
import { defineConfig } from 'drizzle-kit'

mkdirSync('.turso', { recursive: true })

export default defineConfig({
  schema: './server/db/schema.ts',
  out: './drizzle',
  dialect: 'turso',
  dbCredentials: {
    url: 'file:.turso/dev.db',
    authToken: undefined,
  },
})

import { defineConfig } from 'drizzle-kit'
import { productionDatabaseCredentials } from './scripts/production-database.ts'

export default defineConfig({
  schema: './server/db/schema.ts',
  out: './drizzle',
  dialect: 'turso',
  dbCredentials: productionDatabaseCredentials(
    new URL('./turso.production.json', import.meta.url),
  ),
})

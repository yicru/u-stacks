import { defineConfig } from 'drizzle-kit'

import 'dotenv/config'

export default defineConfig({
  out: './drizzle',
  schema: ['./server/db/schema.ts', './server/db/auth-schema.ts'],
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || '',
  },
})

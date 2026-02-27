import { nanoid } from '@server/lib/nanoid'
import { sql } from 'drizzle-orm'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

const timestamps = {
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$onUpdate(() => new Date()),
}

export const tasks = sqliteTable('tasks', {
  id: text('id')
    .notNull()
    .primaryKey()
    .$defaultFn(() => nanoid()),
  title: text('title').notNull(),
  done: integer('done', { mode: 'boolean' }).notNull().default(false),
  ...timestamps,
})

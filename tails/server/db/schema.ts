import { users } from '@server/db/auth-schema'
import { nanoid } from '@server/lib/id'
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
    .$defaultFn(() => nanoid(6)),
  userId: text('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  ...timestamps,
})

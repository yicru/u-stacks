import { users } from '@server/db/auth-schema'
import { nanoid } from '@server/lib/id'
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const tasks = pgTable('tasks', {
  id: text('id')
    .notNull()
    .primaryKey()
    .$defaultFn(() => nanoid(6)),
  userId: text('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  createdAt: timestamp('createdAt', { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { precision: 3 })
    .notNull()
    .$onUpdate(() => new Date()),
})

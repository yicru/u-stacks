import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { Context } from 'effect'
import * as schema from './schema'

type DatabaseClient = LibSQLDatabase<typeof schema>

export class Database extends Context.Service<Database, DatabaseClient>()(
  '@server/db/Database',
) {}

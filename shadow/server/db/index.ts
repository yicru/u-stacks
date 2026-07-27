import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { Context } from 'effect'
import * as schema from './schema'

export type DatabaseClient = LibSQLDatabase<typeof schema>

export class Database extends Context.Tag('@server/db/Database')<
  Database,
  DatabaseClient
>() {}

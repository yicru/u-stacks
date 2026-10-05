# Database migrations

`server/db/schema.ts` is the schema source. `drizzle/` contains generated SQL, snapshots, and the journal. `db:migrate` applies pending files and records their application in `__drizzle_migrations`.

## Fresh databases

For a new local database:

```bash
pnpm run db:migrate
pnpm run dev
```

For a new production database, configure credentials with `pnpm run setup` or write `.dev.vars.production` manually. Setup also pins the selected hostname in `turso.production.json`:

```json
{
  "hostname": "my-app-my-org.turso.io"
}
```

This identifier belongs in Git. Keep the URL and auth token in the ignored `.dev.vars.production`. Production configuration accepts `libsql://` and `https://` endpoints, requires a token, and compares the URL hostname with the pinned identifier. It rejects local endpoints, insecure protocols, and URL credentials, ports, paths, queries, or fragments. Error messages omit the supplied URL and token. The hostname pin protects against accidentally supplying another database's credentials; changing the pin requires reviewing the new destination.

Review the generated SQL and verify the intended target before running:

```bash
pnpm run db:migrate:prod
```

The initial migration creates the task table and is intended for an empty database. Migration scripts perform database writes; production application is a separate operation from changing or deploying application code.

## Schema changes

1. Change `server/db/schema.ts`.
2. Run `pnpm run db:generate --name=<change-name>`.
3. Review the generated SQL, including table rebuilds, constraints, and possible data loss.
4. Apply it to a disposable local database or a copy of representative data with `pnpm run db:migrate`.
5. Run `pnpm run format`, `pnpm run quality`, and `pnpm run build`.
6. Commit the schema, generated SQL, snapshots, and journal together.
7. Confirm the production target, prepare an appropriate backup or recovery point, and apply the reviewed migration with `pnpm run db:migrate:prod`.

Keep applied migration files intact. Add a new migration for later changes. Drizzle records applied history and skips migrations already applied; it does not provide automatic rollback. Destructive changes need a data recovery or forward-fix plan before application.

`pnpm run db:push` is available for temporary local schema experiments. When adopting an experiment into the versioned workflow, generate SQL and validate it against a separate database that has followed the migration history. A database changed through `push` may already contain changes that the pending SQL would try to apply again.

## Databases previously managed with push

The previous template used `drizzle-kit push`, which applied differences directly and did not initialize SQL migration history. Existing tables alone do not prove that every statement in a migration has already been applied.

For disposable local data, preserve the old `.turso/dev.db` separately while the dev server is stopped, then initialize a new database with `pnpm run db:migrate`. Local migration commands always use `.turso/dev.db`, regardless of ambient production credentials.

For existing data that must be retained:

1. Identify the exact database and record a backup or recovery point.
2. Rehearse on an isolated copy. Compare its complete schema with the initial migration and the current schema, including defaults, indexes, and constraints.
3. Decide the baseline SQL and application-history transition from that comparison. A reviewed baseline must describe which changes already exist and which still need execution.
4. Verify the history transition and the next migration on the copy, including data retention and a repeated migration run.
5. Apply that separately reviewed transition to the explicitly selected database before using the regular migration command.

The template does not create a baseline for existing databases automatically. Do not rerun the initial `CREATE TABLE` statements against existing tables or insert migration-history rows solely because a table has the same name. A failed migration is not evidence that the database is ready for the new workflow.

See the official [Drizzle migration approaches](https://orm.drizzle.team/docs/migrations) and [`migrate` command](https://orm.drizzle.team/docs/drizzle-kit-migrate) for SQL application and history behavior.

import { afterEach, describe, expect, test } from 'vite-plus/test'
import { spawnSync } from 'node:child_process'
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '../../..')
const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

describe('SQL migrations', () => {
  test('adds the list index to existing data and preserves data when rerun', async () => {
    const directory = await createFixture()
    await cp(
      join(ROOT, 'drizzle.config.ts'),
      join(directory, 'drizzle.config.ts'),
    )
    await cp(join(ROOT, 'drizzle'), join(directory, 'drizzle'), {
      recursive: true,
    })
    const journalPath = join(directory, 'drizzle/meta/_journal.json')
    const journal = JSON.parse(await readFile(journalPath, 'utf-8'))
    await writeFile(
      journalPath,
      JSON.stringify({ ...journal, entries: journal.entries.slice(0, 1) }),
    )

    const migrate = () =>
      spawnSync('pnpm', ['run', 'db:migrate'], {
        cwd: directory,
        encoding: 'utf-8',
      })
    const first = migrate()
    expect(first.status, first.stderr || first.stdout).toBe(0)

    const insert = runDatabaseScript(
      directory,
      `
await client.execute({
  sql: 'INSERT INTO tasks (id, title, updated_at) VALUES (?, ?, ?)',
  args: ['retained-task', 'Keep existing data', 1],
})
`,
    )
    expect(insert.status, insert.stderr).toBe(0)

    await writeFile(journalPath, JSON.stringify(journal))
    const upgrade = migrate()
    expect(upgrade.status, upgrade.stderr || upgrade.stdout).toBe(0)

    const repeated = migrate()
    expect(repeated.status, repeated.stderr || repeated.stdout).toBe(0)

    const result = runDatabaseScript(
      directory,
      `
const tasks = await client.execute('SELECT id, title FROM tasks')
const history = await client.execute('SELECT COUNT(*) AS count FROM __drizzle_migrations')
const plan = await client.execute('EXPLAIN QUERY PLAN SELECT * FROM tasks ORDER BY created_at DESC, id DESC LIMIT 10')
console.log(JSON.stringify({ tasks: tasks.rows, migrations: history.rows[0].count, sorts: plan.rows.filter((row) => row.detail.includes('TEMP B-TREE')).length }))
`,
    )
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual({
      tasks: [{ id: 'retained-task', title: 'Keep existing data' }],
      migrations: 2,
      sorts: 0,
    })
  })
})

async function createFixture(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'shadow-task-migrations-'))
  temporaryDirectories.push(directory)
  await Promise.all([
    cp(join(ROOT, 'package.json'), join(directory, 'package.json')),
    symlink(join(ROOT, 'node_modules'), join(directory, 'node_modules'), 'dir'),
  ])
  return directory
}

function runDatabaseScript(directory: string, script: string) {
  return spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `
import { createClient } from '@libsql/client'
const client = createClient({ url: 'file:.turso/dev.db' })
try {
${script}
} finally {
  client.close()
}
`,
    ],
    { cwd: directory, encoding: 'utf-8' },
  )
}

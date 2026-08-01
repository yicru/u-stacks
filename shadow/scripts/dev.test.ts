import { spawn } from 'node:child_process'
import { once } from 'node:events'
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'

const ROOT = resolve(import.meta.dirname, '..')
const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

describe('local development', () => {
  test('runs the app against a persistent Turso dev server and stops it afterward', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'shadow-dev-'))
    temporaryDirectories.push(directory)

    const { binDirectory, logPath } = await createFakeCommands(directory)
    const databasePath = join(directory, 'dev.db')
    const port = await findAvailablePort()

    const child = spawn('bun', ['scripts/dev.ts'], {
      cwd: ROOT,
      env: {
        ...process.env,
        PATH: `${binDirectory}:${process.env.PATH}`,
        SHADOW_DEV_TEST_LOG: logPath,
        TURSO_DEV_DB_FILE: databasePath,
        TURSO_DEV_PORT: String(port),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const stderr: Buffer[] = []
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))

    const [exitCode] = (await once(child, 'exit')) as [number | null]
    const processLog = await readFile(logPath, 'utf-8')

    expect(Buffer.concat(stderr).toString()).toBe('')
    expect(exitCode).toBe(0)
    expect(processLog).toContain(
      `turso dev --port ${port} --db-file ${databasePath}`,
    )
    expect(processLog).toContain('portless run vp dev')
    expect(processLog).toContain(`database http://127.0.0.1:${port}`)
    expect(processLog).toContain(`local http://127.0.0.1:${port}`)
    expect(processLog).toContain('turso stopped')
  })

  test('does not start the app when the requested Turso port is occupied', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'shadow-dev-'))
    temporaryDirectories.push(directory)

    const { binDirectory, logPath } = await createFakeCommands(directory)
    const databasePath = join(directory, 'dev.db')
    const occupiedServer = createServer()
    occupiedServer.listen(0, '127.0.0.1')
    await once(occupiedServer, 'listening')
    const address = occupiedServer.address()
    const port = typeof address === 'object' && address ? address.port : 0

    const child = spawn('bun', ['scripts/dev.ts'], {
      cwd: ROOT,
      env: {
        ...process.env,
        PATH: `${binDirectory}:${process.env.PATH}`,
        SHADOW_DEV_TEST_LOG: logPath,
        TURSO_DEV_DB_FILE: databasePath,
        TURSO_DEV_PORT: String(port),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const stderr: Buffer[] = []
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))

    const [exitCode] = (await once(child, 'exit')) as [number | null]
    occupiedServer.close()
    await once(occupiedServer, 'close')
    const processLog = await readFile(logPath, 'utf-8')

    expect(exitCode).toBe(1)
    expect(Buffer.concat(stderr).toString()).toContain(
      `Turso dev port ${port} is already in use.`,
    )
    expect(processLog).not.toContain('portless')
  })
})

async function createFakeCommands(directory: string): Promise<{
  binDirectory: string
  logPath: string
}> {
  const binDirectory = join(directory, 'bin')
  const logPath = join(directory, 'processes.log')
  await mkdir(binDirectory)
  await writeFile(logPath, '')
  await writeExecutable(
    join(binDirectory, 'turso'),
    `#!/usr/bin/env node
const fs = require('node:fs')
const net = require('node:net')
const args = process.argv.slice(2)
const port = Number(args[args.indexOf('--port') + 1])
fs.appendFileSync(process.env.SHADOW_DEV_TEST_LOG, \`turso \${args.join(' ')}\\n\`)
const server = net.createServer((socket) => socket.end())
server.listen(port, '127.0.0.1')
const stop = () => server.close(() => {
  fs.appendFileSync(process.env.SHADOW_DEV_TEST_LOG, 'turso stopped\\n')
  process.exit(0)
})
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
`,
  )
  await writeExecutable(
    join(binDirectory, 'portless'),
    `#!/usr/bin/env node
const fs = require('node:fs')
fs.appendFileSync(process.env.SHADOW_DEV_TEST_LOG, \`portless \${process.argv.slice(2).join(' ')}\\n\`)
fs.appendFileSync(process.env.SHADOW_DEV_TEST_LOG, \`database \${process.env.TURSO_DATABASE_URL}\\n\`)
fs.appendFileSync(process.env.SHADOW_DEV_TEST_LOG, \`local \${process.env.SHADOW_LOCAL_TURSO_URL}\\n\`)
setTimeout(() => process.exit(0), 50)
`,
  )
  return { binDirectory, logPath }
}

async function findAvailablePort(): Promise<number> {
  const server = createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  server.close()
  await once(server, 'close')
  return port
}

async function writeExecutable(path: string, content: string): Promise<void> {
  await writeFile(path, content)
  await chmod(path, 0o755)
}

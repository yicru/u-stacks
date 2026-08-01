import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { connect, createServer } from 'node:net'
import { dirname, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const DEFAULT_DATABASE_FILE = '.turso/dev.db'
const DEFAULT_PORT = 8080
const STARTUP_TIMEOUT_MS = 10_000

const databaseFile = process.env.TURSO_DEV_DB_FILE || DEFAULT_DATABASE_FILE
const databasePath = resolve(ROOT, databaseFile)

mkdirSync(dirname(databasePath), { recursive: true })

let turso: ChildProcess | undefined
let app: ChildProcess | undefined

process.once('SIGINT', () => stopChildren('SIGINT'))
process.once('SIGTERM', () => stopChildren('SIGTERM'))

try {
  const configuredPort = readPort(process.env.TURSO_DEV_PORT)
  const port = await selectPort(configuredPort)
  turso = spawn(
    'turso',
    ['dev', '--port', String(port), '--db-file', databasePath],
    {
      cwd: ROOT,
      stdio: 'inherit',
    },
  )
  await waitForPort(turso, port)
  app = spawn('portless', ['run', 'vp', 'dev'], {
    cwd: ROOT,
    env: {
      ...process.env,
      SHADOW_LOCAL_TURSO_URL: `http://127.0.0.1:${port}`,
      TURSO_AUTH_TOKEN: '',
      TURSO_DATABASE_URL: `http://127.0.0.1:${port}`,
    },
    stdio: 'inherit',
  })
  const result = await waitForExit(app)
  await stopProcess(turso)
  process.exitCode = result.code ?? (result.signal === 'SIGINT' ? 130 : 1)
} catch (error) {
  stopChildren('SIGTERM')
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exitCode = 1
}

function readPort(value: string | undefined): number | undefined {
  if (!value) {
    return undefined
  }

  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error(`Invalid TURSO_DEV_PORT: ${value}`)
  }
  return parsed
}

async function selectPort(configuredPort: number | undefined): Promise<number> {
  if (configuredPort) {
    if (await canConnect(configuredPort)) {
      throw new Error(`Turso dev port ${configuredPort} is already in use.`)
    }
    return configuredPort
  }

  if (!(await canConnect(DEFAULT_PORT))) {
    return DEFAULT_PORT
  }

  const availablePort = await findAvailablePort()
  console.log(
    `Port ${DEFAULT_PORT} is in use. Turso dev will use port ${availablePort}.`,
  )
  return availablePort
}

async function waitForPort(child: ChildProcess, targetPort: number) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS

  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error('Turso dev server exited before it became ready.')
    }
    if (await canConnect(targetPort)) {
      return
    }
    await delay(50)
  }

  throw new Error(
    `Turso dev server did not become ready on port ${targetPort}.`,
  )
}

function canConnect(targetPort: number): Promise<boolean> {
  return new Promise((resolveConnection) => {
    const socket = connect({ host: '127.0.0.1', port: targetPort })
    socket.once('connect', () => {
      socket.destroy()
      resolveConnection(true)
    })
    socket.once('error', () => resolveConnection(false))
  })
}

function findAvailablePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('Failed to find an available Turso dev port.'))
        return
      }
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolvePort(address.port)
      })
    })
  })
}

function waitForExit(
  child: ChildProcess,
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  return new Promise((resolveExit, reject) => {
    child.once('error', reject)
    child.once('exit', (code, signal) => resolveExit({ code, signal }))
  })
}

async function stopProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return
  }

  const exit = waitForExit(child)
  child.kill('SIGTERM')
  await exit
}

function stopChildren(signal: NodeJS.Signals): void {
  if (app?.exitCode === null && app.signalCode === null) {
    app.kill(signal)
  }
  if (turso?.exitCode === null && turso.signalCode === null) {
    turso.kill(signal)
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds))
}

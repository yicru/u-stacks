import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
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

describe('template setup', () => {
  test('keeps the CTA config formatter-compatible after renaming', async () => {
    const directory = await createSetupFixture()
    const child = spawn('bun', ['scripts/setup.ts', 'consumer-app'], {
      cwd: directory,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const stderr: Buffer[] = []
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))
    child.stdin.end('n\n')

    const [exitCode] = (await once(child, 'exit')) as [number | null]
    const ctaConfig = await readFile(join(directory, '.cta.json'), 'utf-8')

    expect(Buffer.concat(stderr).toString()).toBe('')
    expect(exitCode).toBe(0)
    expect(ctaConfig).toContain('"projectName": "consumer-app"')
    expect(ctaConfig).toContain('"chosenAddOns": ["cloudflare"]')
  })
})

async function createSetupFixture(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'shadow-setup-'))
  temporaryDirectories.push(directory)

  const files = [
    '.cta.json',
    'README.md',
    'package.json',
    'scripts/setup.ts',
    'src/routes/__root.tsx',
    'wrangler.jsonc',
  ]

  for (const file of files) {
    const target = join(directory, file)
    await mkdir(dirname(target), { recursive: true })
    await copyFile(join(ROOT, file), target)
  }

  return directory
}

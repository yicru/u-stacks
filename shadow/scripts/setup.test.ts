import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, test } from 'vitest'

const ROOT = resolve(import.meta.dirname, '..')
const TEST_EFFECT_VERSION = '4.0.0'
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
      env: withoutCloudflareCredentials(process.env),
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const stderr: Buffer[] = []
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))
    child.stdin.end('n\nn\n')

    const [exitCode] = (await once(child, 'exit')) as [number | null]
    const ctaConfig = await readFile(join(directory, '.cta.json'), 'utf-8')
    const worktreeInclude = await readFile(
      join(directory, '.worktreeinclude'),
      'utf-8',
    )
    const gitIgnore = await readFile(join(directory, '.gitignore'), 'utf-8')
    const t3Project = JSON.parse(
      await readFile(join(directory, 't3.json'), 'utf-8'),
    ) as {
      $schema: string
      scripts: Array<Record<string, unknown>>
    }

    expect(Buffer.concat(stderr).toString()).toBe('')
    expect(exitCode).toBe(0)
    expect(ctaConfig).toContain('"projectName": "consumer-app"')
    expect(
      await readFile(join(directory, 'cloudflare.config.ts'), 'utf-8'),
    ).toContain("name: 'consumer-app'")
    expect(ctaConfig).toContain('"chosenAddOns": ["cloudflare"]')
    expect(worktreeInclude).toBe(
      '/.dev.vars\n/.cloudflare.json\n/.dev.vars.production\n',
    )
    expect(gitIgnore.match(/^\.repos\/effect$/gm)).toHaveLength(1)
    expect(t3Project).toEqual({
      $schema: 'https://t3.codes/schema/t3.json',
      scripts: [
        {
          name: 'Setup Shadow Worktree',
          command: "node 'scripts/setup-worktree.mjs'",
          icon: 'configure',
          runOnWorktreeCreate: true,
        },
      ],
    })
  })

  test('updates the repository root include file for a monorepo', async () => {
    const repository = await createTemporaryDirectory()
    const directory = await createSetupFixture(
      join(repository, 'order-management'),
    )
    const gitInit = spawnSync('git', ['init', '--quiet'], {
      cwd: repository,
      encoding: 'utf-8',
    })
    await writeFile(join(repository, '.worktreeinclude'), '/existing/.env\n')
    await writeFile(
      join(repository, 't3.json'),
      `${JSON.stringify(
        {
          $schema: 'https://t3.codes/schema/t3.json',
          iconPath: 'assets/icon.svg',
          defaultThreadEnvMode: 'worktree',
          scripts: [
            {
              name: 'Start app',
              command: 'bun run dev',
              icon: 'play',
            },
            {
              name: 'Apply .worktreeinclude',
              command: 'git worktreeinclude apply',
              icon: 'configure',
              runOnWorktreeCreate: true,
            },
          ],
        },
        null,
        2,
      )}\n`,
    )

    expect(gitInit.status).toBe(0)

    for (let run = 0; run < 2; run += 1) {
      const child = spawn('bun', ['scripts/setup.ts', 'consumer-app'], {
        cwd: directory,
        env: withoutCloudflareCredentials(process.env),
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      child.stdin.end('n\nn\n')

      const [exitCode] = (await once(child, 'exit')) as [number | null]
      expect(exitCode).toBe(0)
    }

    const worktreeInclude = await readFile(
      join(repository, '.worktreeinclude'),
      'utf-8',
    )
    const gitIgnore = await readFile(join(repository, '.gitignore'), 'utf-8')
    const t3Project = JSON.parse(
      await readFile(join(repository, 't3.json'), 'utf-8'),
    ) as {
      iconPath: string
      defaultThreadEnvMode: string
      scripts: Array<Record<string, unknown>>
    }

    expect(worktreeInclude).toBe(
      '/existing/.env\n/order-management/.dev.vars\n/order-management/.cloudflare.json\n/order-management/.dev.vars.production\n',
    )
    expect(gitIgnore).toBe('/.repos/effect/\n')
    expect(t3Project.iconPath).toBe('assets/icon.svg')
    expect(t3Project.defaultThreadEnvMode).toBe('worktree')
    expect(t3Project.scripts).toContainEqual({
      name: 'Start app',
      command: 'bun run dev',
      icon: 'play',
    })
    expect(
      t3Project.scripts.filter(
        (script) => script.name === 'Setup Shadow Worktree',
      ),
    ).toEqual([
      {
        name: 'Setup Shadow Worktree',
        command: "node 'order-management/scripts/setup-worktree.mjs'",
        icon: 'configure',
        runOnWorktreeCreate: true,
      },
    ])
    expect(
      t3Project.scripts.some(
        (script) => script.name === 'Apply .worktreeinclude',
      ),
    ).toBe(false)
  })

  test('sets up a worktree without an additional CLI', async () => {
    const repository = await createTemporaryDirectory()
    const directory = await createSetupFixture(
      join(repository, 'order-management'),
    )
    const gitInit = spawnSync('git', ['init', '--quiet'], {
      cwd: repository,
      encoding: 'utf-8',
    })
    await writeFile(
      join(repository, '.gitignore'),
      '/order-management/.dev.vars\n/order-management/.cloudflare.json\n/order-management/.dev.vars.production\n',
    )

    expect(gitInit.status).toBe(0)

    const setup = spawn('bun', ['scripts/setup.ts', 'consumer-app'], {
      cwd: directory,
      env: withoutCloudflareCredentials(process.env),
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    setup.stdin.end('n\nn\n')

    const [setupExitCode] = (await once(setup, 'exit')) as [number | null]
    expect(setupExitCode).toBe(0)

    await writeFile(
      join(directory, '.cloudflare.json'),
      '{"profile":"local"}\n',
    )
    await writeFile(join(directory, '.dev.vars.production'), 'SECRET=value\n')
    await writeFile(join(directory, 'not-ignored.txt'), 'not ignored\n')
    await writeFile(
      join(repository, '.worktreeinclude'),
      `${await readFile(join(repository, '.worktreeinclude'), 'utf-8')}/order-management/not-ignored.txt\n`,
    )

    const worktree = await createTemporaryDirectory()
    const worktreeApp = join(worktree, 'order-management')
    await mkdir(join(worktreeApp, 'scripts'), { recursive: true })
    for (const file of [
      'package.json',
      'scripts/apply-worktreeinclude.mjs',
      'scripts/prepare-effect.mjs',
      'scripts/setup-worktree.mjs',
    ]) {
      const target = join(worktreeApp, file)
      await mkdir(dirname(target), { recursive: true })
      await copyFile(join(directory, file), target)
    }
    await writeFile(join(worktreeApp, '.dev.vars'), 'keep existing\n')

    const effectRepository = await createEffectSourceRepository()
    const commandLog = join(worktree, 'commands.log')
    const stubBinaryDirectory = await writeBunInstallStub(
      await createTemporaryDirectory(),
      commandLog,
    )

    const t3Project = JSON.parse(
      await readFile(join(repository, 't3.json'), 'utf-8'),
    ) as {
      scripts: Array<{ name: string; command: string }>
    }
    const command = t3Project.scripts.find(
      (script) => script.name === 'Setup Shadow Worktree',
    )?.command

    expect(command).toBe("node 'order-management/scripts/setup-worktree.mjs'")

    const actionEnvironment = {
      ...process.env,
      T3CODE_PROJECT_ROOT: repository,
      T3CODE_WORKTREE_PATH: worktree,
      EFFECT_SOURCE_REPOSITORY_URL: pathToFileURL(effectRepository).href,
      PATH: `${stubBinaryDirectory}${delimiter}${process.env.PATH ?? ''}`,
      SHADOW_SETUP_TEST_LOG: commandLog,
    }
    const action = spawnSync(command ?? '', {
      cwd: worktree,
      env: actionEnvironment,
      encoding: 'utf-8',
      shell: true,
    })

    expect(action.stderr).toBe('')
    expect(action.status).toBe(0)
    expect(await readFile(commandLog, 'utf-8')).toContain(
      'install --frozen-lockfile',
    )
    expect(await readFile(join(worktreeApp, '.dev.vars'), 'utf-8')).toBe(
      'keep existing\n',
    )
    expect(await readFile(join(worktreeApp, '.cloudflare.json'), 'utf-8')).toBe(
      '{"profile":"local"}\n',
    )
    expect(
      await readFile(join(worktreeApp, '.dev.vars.production'), 'utf-8'),
    ).toBe('SECRET=value\n')
    await expect(
      readFile(join(worktreeApp, 'not-ignored.txt'), 'utf-8'),
    ).rejects.toMatchObject({ code: 'ENOENT' })
    const effectTag = spawnSync(
      'git',
      [
        '-C',
        join(worktree, '.repos/effect'),
        'describe',
        '--tags',
        '--exact-match',
        '--match',
        `effect@${TEST_EFFECT_VERSION}`,
        'HEAD',
      ],
      { encoding: 'utf-8' },
    )
    expect(effectTag.status).toBe(0)
    expect(effectTag.stdout.trim()).toBe(`effect@${TEST_EFFECT_VERSION}`)

    const repeatedAction = spawnSync(command ?? '', {
      cwd: worktree,
      env: actionEnvironment,
      encoding: 'utf-8',
      shell: true,
    })
    expect(repeatedAction.stderr).toBe('')
    expect(repeatedAction.status).toBe(0)
    expect(repeatedAction.stdout).toContain(
      `Effect source effect@${TEST_EFFECT_VERSION} is already prepared.`,
    )
  })

  test('pins the selected Cloudflare profile and account', async () => {
    const directory = await createSetupFixture()
    const logPath = join(directory, 'cf.log')
    await writeCfStub(directory)

    const child = spawn('bun', ['scripts/setup.ts', 'consumer-app'], {
      cwd: directory,
      env: withoutCloudflareCredentials({
        ...process.env,
        SHADOW_SETUP_TEST_LOG: logPath,
      }),
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))
    child.stdin.end('n\ny\nclient-profile\n2\n')

    const [exitCode] = (await once(child, 'exit')) as [number | null]
    const cloudflareConfig = JSON.parse(
      await readFile(join(directory, '.cloudflare.json'), 'utf-8'),
    ) as { profile: string; accountId: string }
    const workerConfig = await readFile(
      join(directory, 'cloudflare.config.ts'),
      'utf-8',
    )
    const cfLog = await readFile(logPath, 'utf-8')

    expect(Buffer.concat(stderr).toString()).toBe('')
    expect(exitCode).toBe(0)
    expect(cloudflareConfig).toEqual({
      profile: 'client-profile',
      accountId: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    })
    expect(workerConfig).toContain(
      "const accountId: string | undefined = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'",
    )
    expect(cfLog).toContain('auth activate client-profile ')
    expect(cfLog).toContain('auth whoami --profile client-profile')
    expect(Buffer.concat(stdout).toString()).toContain(
      'Cloudflare profile "client-profile" is pinned to Beta Account',
    )
    expect(Buffer.concat(stdout).toString()).toContain(
      'Cloudflare resources and API tokens were not created.',
    )
  })
})

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'shadow-setup-'))
  temporaryDirectories.push(directory)
  return directory
}

async function createSetupFixture(targetDirectory?: string): Promise<string> {
  const directory = targetDirectory ?? (await createTemporaryDirectory())
  await mkdir(directory, { recursive: true })

  const files = [
    '.gitignore',
    '.cta.json',
    'README.md',
    'package.json',
    'scripts/apply-worktreeinclude.mjs',
    'scripts/cloudflare-config.ts',
    'scripts/prepare-effect.mjs',
    'scripts/setup.ts',
    'scripts/setup-worktree.mjs',
    'src/routes/__root.tsx',
    'cloudflare.config.ts',
  ]

  for (const file of files) {
    const target = join(directory, file)
    await mkdir(dirname(target), { recursive: true })
    await copyFile(join(ROOT, file), target)
  }

  return directory
}

async function createEffectSourceRepository(): Promise<string> {
  const directory = await createTemporaryDirectory()
  const commands = [
    ['init', '--quiet'],
    ['add', 'README.md'],
    [
      '-c',
      'user.name=Shadow Setup Test',
      '-c',
      'user.email=shadow-setup@example.invalid',
      'commit',
      '--quiet',
      '-m',
      'Initial Effect source',
    ],
    ['tag', `effect@${TEST_EFFECT_VERSION}`],
    ['tag', `@effect/platform-bun@${TEST_EFFECT_VERSION}`],
  ]

  await writeFile(join(directory, 'README.md'), 'Effect source fixture\n')

  for (const args of commands) {
    const result = spawnSync('git', args, { cwd: directory, encoding: 'utf-8' })
    expect(result.status).toBe(0)
  }

  return directory
}

async function writeBunInstallStub(
  directory: string,
  logPath: string,
): Promise<string> {
  const binaryDirectory = join(directory, 'bin')
  const binaryPath = join(binaryDirectory, 'bun')
  await mkdir(binaryDirectory, { recursive: true })
  await writeFile(logPath, '')
  await writeFile(
    binaryPath,
    `#!/usr/bin/env node
const { appendFileSync, mkdirSync, writeFileSync } = require('node:fs')
const { dirname, join } = require('node:path')

const args = process.argv.slice(2)
appendFileSync(process.env.SHADOW_SETUP_TEST_LOG, args.join(' ') + '\\n')

const packagePath = join(process.cwd(), 'node_modules/effect/package.json')
mkdirSync(dirname(packagePath), { recursive: true })
writeFileSync(packagePath, JSON.stringify({ version: '${TEST_EFFECT_VERSION}' }))
`,
  )
  await chmod(binaryPath, 0o755)

  return binaryDirectory
}

async function writeCfStub(directory: string): Promise<void> {
  const binaryPath = join(directory, 'node_modules/cf/bin/cf')
  await mkdir(dirname(binaryPath), { recursive: true })
  await writeFile(
    binaryPath,
    `#!/usr/bin/env node
import { appendFileSync } from 'node:fs'

const args = process.argv.slice(2)
appendFileSync(process.env.SHADOW_SETUP_TEST_LOG, \`${"${args.join(' ')}"}\\n\`)

if (args[0] === 'auth' && args[1] === 'activate') {
  process.exit(0)
}

if (args[0] === 'auth' && args[1] === 'whoami') {
  console.log(JSON.stringify({
    authenticated: true,
    tokenValid: true,
    accounts: [
      { id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', name: 'Alpha Account' },
      { id: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', name: 'Beta Account' },
    ],
  }))
  process.exit(0)
}

process.exit(1)
`,
  )
  await chmod(binaryPath, 0o755)
}

function withoutCloudflareCredentials(
  env: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const nextEnv = { ...env }
  delete nextEnv.CLOUDFLARE_API_TOKEN
  delete nextEnv.CLOUDFLARE_API_KEY
  delete nextEnv.CLOUDFLARE_EMAIL
  delete nextEnv.CF_API_TOKEN
  delete nextEnv.CF_API_KEY
  delete nextEnv.CF_EMAIL
  return nextEnv
}

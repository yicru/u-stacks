import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, test } from 'vite-plus/test'

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
  test('creates a new production database in Tokyo by default', async () => {
    const directory = await createSetupFixture()
    const binaryDirectory = join(directory, 'bin')
    const commandLog = join(directory, 'turso.log')
    await mkdir(binaryDirectory)
    await writeFile(
      join(binaryDirectory, 'turso'),
      `#!/usr/bin/env node
import { appendFileSync } from 'node:fs'
const args = process.argv.slice(2)
appendFileSync(process.env.SHADOW_SETUP_TEST_LOG, args.join(' ') + '\\n')
if (args[0] === 'db' && args[1] === 'show') console.log('libsql://production.turso.io')
if (args[0] === 'db' && args[1] === 'tokens') console.log('fixture-token')
if (args[0] === 'group') console.log('NAME PRIMARY LOCATIONS')
`,
    )
    await chmod(join(binaryDirectory, 'turso'), 0o755)
    const child = spawn(
      process.execPath,
      ['scripts/setup.ts', 'consumer-app'],
      {
        cwd: directory,
        env: withoutCloudflareCredentials({
          ...process.env,
          PATH: `${binaryDirectory}${delimiter}${process.env.PATH ?? ''}`,
          SHADOW_SETUP_TEST_LOG: commandLog,
        }),
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    )
    const stderr: Buffer[] = []
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))
    child.stdin.end('y\ny\nconsumer-app\n\n\nn\n')

    const [exitCode] = (await once(child, 'exit')) as [number | null]

    expect(Buffer.concat(stderr).toString()).toBe('')
    expect(exitCode).toBe(0)
    expect(await readFile(commandLog, 'utf-8')).toContain(
      'db create consumer-app --location aws-ap-northeast-1 --wait',
    )
  })

  test('pins the manually selected production database without storing its token in the target', async () => {
    const directory = await createSetupFixture()
    const binaryDirectory = join(directory, 'bin')
    await mkdir(binaryDirectory)
    await writeFile(join(binaryDirectory, 'turso'), '#!/bin/sh\nexit 1\n')
    await chmod(join(binaryDirectory, 'turso'), 0o755)
    const child = spawn(
      process.execPath,
      ['scripts/setup.ts', 'consumer-app'],
      {
        cwd: directory,
        env: withoutCloudflareCredentials({
          ...process.env,
          PATH: `${binaryDirectory}${delimiter}${process.env.PATH ?? ''}`,
        }),
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    )
    const stderr: Buffer[] = []
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))
    child.stdin.end('y\ny\nlibsql://production.turso.io\nfixture-token\nn\n')

    const [exitCode] = (await once(child, 'exit')) as [number | null]
    expect(Buffer.concat(stderr).toString()).toBe('')
    expect(exitCode).toBe(0)
    expect(
      JSON.parse(
        await readFile(join(directory, 'turso.production.json'), 'utf-8'),
      ),
    ).toEqual({ hostname: 'production.turso.io' })
    const credentials = await readFile(
      join(directory, '.dev.vars.production'),
      'utf-8',
    )
    expect(credentials).toContain(
      'TURSO_DATABASE_URL=libsql://production.turso.io',
    )
    expect(credentials).toContain('TURSO_AUTH_TOKEN=fixture-token')
  })

  test('uses arrow-key account selection and masks manually entered tokens', async () => {
    const directory = await createSetupFixture()
    const binaryDirectory = join(directory, 'bin')
    await mkdir(binaryDirectory)
    await writeFile(join(binaryDirectory, 'turso'), '#!/bin/sh\nexit 1\n')
    await chmod(join(binaryDirectory, 'turso'), 0o755)
    await writeCfStub(directory)

    const result = await runInteractiveSetup(
      directory,
      [
        { prompt: 'Enter your app name', value: 'consumer-app\r' },
        { prompt: 'Configure production Turso now?', value: '\u001b[C\r' },
        { prompt: 'Enter Turso URL and token manually?', value: '\r' },
        {
          prompt: 'TURSO_DATABASE_URL',
          value: 'libsql://production.turso.io\r',
        },
        { prompt: 'TURSO_AUTH_TOKEN', value: 'interactive-fixture-token\r' },
        { prompt: 'Configure Cloudflare deployment now?', value: '\u001b[C\r' },
        { prompt: 'Cloudflare cf profile name', value: 'client-profile\r' },
        { prompt: 'Select a Cloudflare account', value: '\u001b[B\r' },
      ],
      {
        PATH: `${binaryDirectory}${delimiter}${process.env.PATH ?? ''}`,
        SHADOW_SETUP_TEST_LOG: join(directory, 'cf.log'),
      },
    )

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).not.toContain('interactive-fixture-token')
    expect(
      await readFile(join(directory, '.dev.vars.production'), 'utf-8'),
    ).toContain('TURSO_AUTH_TOKEN=interactive-fixture-token')
    expect(
      JSON.parse(await readFile(join(directory, '.cloudflare.json'), 'utf-8')),
    ).toEqual({
      profile: 'client-profile',
      accountId: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    })
  })

  test.each([
    { mode: 'cancel', keys: '\u0003' },
    { mode: 'location', keys: '\r' },
    { mode: 'group', keys: '\u001b[A\u001b[A\r' },
  ])(
    'handles interactive Turso group selection: $mode',
    async ({ mode, keys }) => {
      const directory = await createSetupFixture()
      const binaryDirectory = join(directory, 'bin')
      const commandLog = join(directory, 'turso.log')
      await mkdir(binaryDirectory)
      await writeFile(
        join(binaryDirectory, 'turso'),
        `#!/usr/bin/env node
import { appendFileSync } from 'node:fs'
const args = process.argv.slice(2)
appendFileSync(process.env.SHADOW_SETUP_TEST_LOG, args.join(' ') + '\\n')
if (args[0] === 'group') console.log('NAME PRIMARY LOCATIONS\\namerica aws-us-east-1\\njapan aws-ap-northeast-1')
if (args[0] === 'db' && args[1] === 'show') console.log('libsql://production.turso.io')
if (args[0] === 'db' && args[1] === 'tokens') console.log('fixture-token')
`,
      )
      await chmod(join(binaryDirectory, 'turso'), 0o755)

      const result = await runInteractiveSetup(
        directory,
        [
          { prompt: 'Enter your app name', value: '\r' },
          { prompt: 'Configure production Turso now?', value: '\u001b[C\r' },
          { prompt: 'Create a new Turso database now?', value: '\r' },
          { prompt: 'Turso database name', value: '\r' },
          { prompt: 'Select a Turso group', value: keys },
          ...(mode === 'location'
            ? [{ prompt: 'Turso location', value: '\r' }]
            : []),
          ...(mode === 'cancel'
            ? []
            : [
                { prompt: 'Configure Cloudflare deployment now?', value: '\r' },
              ]),
        ],
        {
          PATH: `${binaryDirectory}${delimiter}${process.env.PATH ?? ''}`,
          SHADOW_SETUP_TEST_LOG: commandLog,
        },
      )

      expect(result.stderr).toBe('')
      expect(result.stdout).not.toContain('Enter Turso URL and token manually?')
      const commands = await readFile(commandLog, 'utf-8')
      if (mode === 'cancel') {
        expect(result.exitCode).toBe(1)
        expect(result.stdout).toContain('Setup cancelled.')
        expect(commands).not.toContain('db create')
        await expect(
          readFile(join(directory, '.dev.vars.production'), 'utf-8'),
        ).rejects.toMatchObject({ code: 'ENOENT' })
      } else {
        expect(result.exitCode).toBe(0)
        expect(commands).toContain(
          mode === 'location'
            ? '--location aws-ap-northeast-1 --wait'
            : '--group japan --wait',
        )
        expect(
          JSON.parse(
            await readFile(join(directory, 'turso.production.json'), 'utf-8'),
          ),
        ).toEqual({ hostname: 'production.turso.io' })
      }
    },
  )

  test('exits when piped input ends before a required answer', async () => {
    const directory = await createSetupFixture()
    await writeCfStub(directory)
    const child = spawn(
      process.execPath,
      ['scripts/setup.ts', 'consumer-app'],
      {
        cwd: directory,
        env: withoutCloudflareCredentials(process.env),
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    )
    const stderr: Buffer[] = []
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))
    child.stdout.resume()
    child.stdin.end('n\ny\n')

    const [exitCode] = (await once(child, 'close')) as [number | null]

    expect(exitCode).toBe(1)
    expect(Buffer.concat(stderr).toString()).toContain(
      'Input ended before setup completed.',
    )
    await expect(
      readFile(join(directory, '.cloudflare.json'), 'utf-8'),
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })

  test('waits for interactive answers and keeps renamed configuration formatter-compatible', async () => {
    const directory = await createSetupFixture()
    const agentInstructions = await readFile(
      join(directory, 'AGENTS.md'),
      'utf-8',
    )
    const child = spawn(process.execPath, ['scripts/setup.ts'], {
      cwd: directory,
      env: withoutCloudflareCredentials(process.env),
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const stderr: Buffer[] = []
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))
    const answers = [
      { prompt: 'Enter your app name', value: 'consumer-app' },
      { prompt: 'Configure production Turso now?', value: 'n' },
      { prompt: 'Configure Cloudflare deployment now?', value: 'n' },
    ]
    let transcript = ''
    let answerIndex = 0
    let answerTimer: ReturnType<typeof setTimeout> | undefined
    child.stdout.on('data', (chunk: Buffer) => {
      transcript += chunk.toString()
      const answer = answers[answerIndex]
      if (!answer || !transcript.includes(answer.prompt)) return
      answerIndex += 1
      answerTimer = setTimeout(() => {
        if (child.stdin.destroyed) return
        if (answerIndex === answers.length) {
          child.stdin.end(`${answer.value}\n`)
        } else {
          child.stdin.write(`${answer.value}\n`)
        }
      }, 50)
    })

    const [exitCode] = (await once(child, 'close')) as [number | null]
    clearTimeout(answerTimer)
    expect(Buffer.concat(stderr).toString()).toBe('')
    expect(exitCode).toBe(0)
    expect(answerIndex).toBe(answers.length)
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

    expect(ctaConfig).toContain('"projectName": "consumer-app"')
    expect(
      await readFile(join(directory, 'cloudflare.config.ts'), 'utf-8'),
    ).toContain("name: 'consumer-app'")
    expect(ctaConfig).toContain('"chosenAddOns": ["cloudflare"]')
    expect(await readFile(join(directory, 'AGENTS.md'), 'utf-8')).toBe(
      agentInstructions,
    )
    expect(
      (await lstat(join(directory, '.agents/skills/effect-ts'))).isDirectory(),
    ).toBe(true)
    expect(worktreeInclude).toBe(
      '/.dev.vars\n/.cloudflare.json\n/.dev.vars.production\n',
    )
    expect(gitIgnore.match(/^\.repos\/effect$/gm)).toHaveLength(1)
    expect(t3Project).toEqual({
      $schema: 'https://t3.codes/schema/t3.json',
      scripts: [
        {
          name: 'Setup consumer-app Worktree',
          command: "node 'scripts/setup-worktree.mjs'",
          icon: 'configure',
          runOnWorktreeCreate: true,
        },
      ],
    })
  })

  test('registers monorepo instructions, discoverable skills and worktree setup idempotently', async () => {
    const repository = await createTemporaryDirectory()
    const directory = await createSetupFixture(
      join(repository, 'order-management'),
    )
    const gitInit = spawnSync('git', ['init', '--quiet'], {
      cwd: repository,
      encoding: 'utf-8',
    })
    await writeFile(join(repository, '.worktreeinclude'), '/existing/.env\n')
    const existingInstructions =
      '# Repository instructions\n\nPreserve existing app conventions.\n'
    await writeFile(join(repository, 'AGENTS.md'), existingInstructions)
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
              command: 'pnpm run dev',
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
      const result = await runLocalSetup(directory)
      expect(result.stderr).toBe('')
      expect(result.exitCode).toBe(0)
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
      command: 'pnpm run dev',
      icon: 'play',
    })
    expect(
      t3Project.scripts.filter(
        (script) => script.name === 'Setup order-management Worktree',
      ),
    ).toEqual([
      {
        name: 'Setup order-management Worktree',
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

    const rootInstructions = await readFile(
      join(repository, 'AGENTS.md'),
      'utf-8',
    )
    expect(rootInstructions.startsWith(existingInstructions)).toBe(true)
    expect(
      rootInstructions.match(/order-management\/AGENTS\.md/g),
    ).toHaveLength(1)
    expect(rootInstructions).toContain('order-management/.agents/skills/')
    for (const skill of ['effect-ts', 'shadcn']) {
      const source = join(directory, '.agents/skills', skill)
      const target = join(repository, '.agents/skills', skill)
      expect((await lstat(target)).isSymbolicLink()).toBe(true)
      expect(await readlink(target)).toBe(
        `../../order-management/.agents/skills/${skill}`,
      )
      expect(await readFile(join(target, 'SKILL.md'), 'utf-8')).toBe(
        await readFile(join(source, 'SKILL.md'), 'utf-8'),
      )
    }
    expect(
      await readFile(
        join(repository, '.agents/skills/shadcn/rules/forms.md'),
        'utf-8',
      ),
    ).toBe(
      await readFile(
        join(directory, '.agents/skills/shadcn/rules/forms.md'),
        'utf-8',
      ),
    )
  })

  test('keeps separate worktree actions for multiple apps and migrates the matching legacy action', async () => {
    const repository = await createTemporaryDirectory()
    const paths = ['apps/admin', 'apps/customer portal']
    const directories = await Promise.all(
      paths.map((path) => createSetupFixture(join(repository, path))),
    )
    expect(
      spawnSync('git', ['init', '--quiet'], { cwd: repository }).status,
    ).toBe(0)
    await writeFile(
      join(repository, 't3.json'),
      JSON.stringify({
        scripts: [
          {
            name: 'Apply .worktreeinclude',
            command: 'git worktreeinclude apply',
            icon: 'configure',
            runOnWorktreeCreate: true,
          },
          {
            name: 'Setup Shadow Worktree',
            command: "node 'apps/admin/scripts/setup-worktree.mjs'",
            icon: 'configure',
            runOnWorktreeCreate: true,
            async: true,
          },
        ],
      }),
    )

    for (const directory of [...directories, directories[0]]) {
      expect((await runLocalSetup(directory)).exitCode).toBe(0)
    }

    const project = JSON.parse(
      await readFile(join(repository, 't3.json'), 'utf-8'),
    ) as {
      scripts: Array<Record<string, unknown>>
    }
    expect(project.scripts).toHaveLength(2)
    expect(project.scripts).toEqual(
      expect.arrayContaining([
        {
          name: 'Setup apps/admin Worktree',
          command: "node 'apps/admin/scripts/setup-worktree.mjs'",
          icon: 'configure',
          runOnWorktreeCreate: true,
          async: true,
        },
        {
          name: 'Setup apps/customer portal Worktree',
          command: "node 'apps/customer portal/scripts/setup-worktree.mjs'",
          icon: 'configure',
          runOnWorktreeCreate: true,
        },
      ]),
    )
    const instructions = await readFile(join(repository, 'AGENTS.md'), 'utf-8')
    for (const path of paths) {
      expect(instructions.split(`${path}/AGENTS.md`)).toHaveLength(2)
    }
    expect(await readlink(join(repository, '.agents/skills/effect-ts'))).toBe(
      '../../apps/admin/.agents/skills/effect-ts',
    )
  })

  test.each(['directory', 'file', 'symlink'])(
    'preserves an existing root skill %s and reports the conflict',
    async (kind) => {
      const repository = await createTemporaryDirectory()
      const directory = await createSetupFixture(
        join(repository, 'task-management'),
      )
      expect(
        spawnSync('git', ['init', '--quiet'], { cwd: repository }).status,
      ).toBe(0)
      const target = join(repository, '.agents/skills/effect-ts')
      await mkdir(dirname(target), { recursive: true })
      if (kind === 'directory') {
        await mkdir(target)
        await writeFile(join(target, 'SKILL.md'), 'Existing skill\n')
      } else if (kind === 'file') {
        await writeFile(target, 'Existing skill\n')
      } else {
        await symlink('../../missing-skill', target, 'dir')
      }

      const result = await runLocalSetup(directory)
      expect(result.exitCode).toBe(0)
      expect(result.stderr).toContain('.agents/skills/effect-ts')
      expect(result.stderr).toContain(
        'task-management/.agents/skills/effect-ts',
      )
      if (kind === 'symlink') {
        expect(await readlink(target)).toBe('../../missing-skill')
      } else {
        expect(
          await readFile(
            kind === 'file' ? target : join(target, 'SKILL.md'),
            'utf-8',
          ),
        ).toBe('Existing skill\n')
      }
      expect(
        await readFile(
          join(repository, '.agents/skills/shadcn/SKILL.md'),
          'utf-8',
        ),
      ).toBe(
        await readFile(
          join(directory, '.agents/skills/shadcn/SKILL.md'),
          'utf-8',
        ),
      )
    },
  )

  test('sets up a Git worktree with discoverable skills and without an additional CLI', async () => {
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

    const setup = spawn(
      process.execPath,
      ['scripts/setup.ts', 'consumer-app'],
      {
        cwd: directory,
        env: withoutCloudflareCredentials(process.env),
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    )
    setup.stdin.end('n\nn\n')

    const [setupExitCode] = (await once(setup, 'exit')) as [number | null]
    expect(setupExitCode).toBe(0)

    for (const args of [
      ['add', '.'],
      [
        '-c',
        'user.name=Shadow Setup Test',
        '-c',
        'user.email=shadow-setup@example.invalid',
        'commit',
        '--quiet',
        '-m',
        'Initialize app',
      ],
    ]) {
      expect(
        spawnSync('git', args, { cwd: repository, encoding: 'utf-8' }).status,
      ).toBe(0)
    }

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
    const addWorktree = spawnSync(
      'git',
      ['worktree', 'add', '--quiet', '--detach', worktree, 'HEAD'],
      {
        cwd: repository,
        encoding: 'utf-8',
      },
    )
    expect(addWorktree.stderr).toBe('')
    expect(addWorktree.status).toBe(0)
    expect(
      await readFile(
        join(worktree, '.agents/skills/effect-ts/SKILL.md'),
        'utf-8',
      ),
    ).toBe(
      await readFile(
        join(worktreeApp, '.agents/skills/effect-ts/SKILL.md'),
        'utf-8',
      ),
    )
    await writeFile(join(worktreeApp, '.dev.vars'), 'keep existing\n')

    const effectRepository = await createEffectSourceRepository()
    const commandLog = join(worktree, 'commands.log')
    const stubBinaryDirectory = await writePnpmInstallStub(
      await createTemporaryDirectory(),
      commandLog,
    )

    const t3Project = JSON.parse(
      await readFile(join(worktree, 't3.json'), 'utf-8'),
    ) as {
      scripts: Array<{ name: string; command: string }>
    }
    const command = t3Project.scripts.find(
      (script) => script.name === 'Setup order-management Worktree',
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

    const child = spawn(
      process.execPath,
      ['scripts/setup.ts', 'consumer-app'],
      {
        cwd: directory,
        env: withoutCloudflareCredentials({
          ...process.env,
          SHADOW_SETUP_TEST_LOG: logPath,
        }),
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    )
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
  await mkdir(join(directory, 'node_modules'), { recursive: true })
  await symlink(
    join(ROOT, 'node_modules/effect'),
    join(directory, 'node_modules/effect'),
    'dir',
  )
  await mkdir(join(directory, 'node_modules/@clack'), { recursive: true })
  await symlink(
    join(ROOT, 'node_modules/@clack/prompts'),
    join(directory, 'node_modules/@clack/prompts'),
    'dir',
  )

  const files = [
    'AGENTS.md',
    '.agents/skills/effect-ts/SKILL.md',
    '.agents/skills/shadcn/SKILL.md',
    '.agents/skills/shadcn/rules/forms.md',
    '.gitignore',
    '.cta.json',
    'README.md',
    'package.json',
    'scripts/apply-worktreeinclude.mjs',
    'scripts/cloudflare-config.ts',
    'scripts/prepare-effect.mjs',
    'scripts/production-database.ts',
    'scripts/setup.ts',
    'scripts/setup-worktree.mjs',
    'src/routes/__root.tsx',
    'cloudflare.config.ts',
    'turso.production.json',
  ]

  for (const file of files) {
    const target = join(directory, file)
    await mkdir(dirname(target), { recursive: true })
    await copyFile(join(ROOT, file), target)
  }
  return directory
}

async function runLocalSetup(
  directory: string,
): Promise<{ exitCode: number | null; stderr: string }> {
  const child = spawn(process.execPath, ['scripts/setup.ts', 'consumer-app'], {
    cwd: directory,
    env: withoutCloudflareCredentials(process.env),
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  const stderr: Buffer[] = []
  child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))
  child.stdout.resume()
  child.stdin.end('n\nn\n')
  const [exitCode] = (await once(child, 'close')) as [number | null]
  return { exitCode, stderr: Buffer.concat(stderr).toString() }
}

async function runInteractiveSetup(
  directory: string,
  answers: Array<{ prompt: string; value: string }>,
  environment: NodeJS.ProcessEnv,
): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  const terminalPath = join(directory, 'terminal.mjs')
  await writeFile(
    terminalPath,
    `process.stdin.isTTY = true
process.stdin.setRawMode = function (raw) { this.isRaw = raw; return this }
process.stdout.isTTY = true
process.stdout.columns = 120
process.stdout.rows = 40
`,
  )
  const child = spawn(
    process.execPath,
    ['--import', pathToFileURL(terminalPath).href, 'scripts/setup.ts'],
    {
      cwd: directory,
      env: withoutCloudflareCredentials({
        ...process.env,
        ...environment,
        TERM: 'xterm-256color',
        CI: '',
        FORCE_COLOR: '0',
      }),
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  )
  const stderr: Buffer[] = []
  let stdout = ''
  let answerIndex = 0
  let answerTimer: ReturnType<typeof setTimeout> | undefined
  child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))
  child.stdout.on('data', (chunk: Buffer) => {
    stdout += chunk.toString()
    const answer = answers[answerIndex]
    if (!answer || !stdout.includes(answer.prompt)) return
    answerIndex += 1
    answerTimer = setTimeout(() => {
      if (child.stdin.destroyed) return
      if (answerIndex === answers.length) child.stdin.end(answer.value)
      else child.stdin.write(answer.value)
    }, 30)
  })

  const [exitCode] = (await once(child, 'close')) as [number | null]
  clearTimeout(answerTimer)
  expect(answerIndex).toBe(answers.length)
  return { exitCode, stdout, stderr: Buffer.concat(stderr).toString() }
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

async function writePnpmInstallStub(
  directory: string,
  logPath: string,
): Promise<string> {
  const binaryDirectory = join(directory, 'bin')
  const binaryPath = join(binaryDirectory, 'pnpm')
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

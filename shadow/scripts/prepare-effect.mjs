import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const EFFECT_REPOSITORY_URL = 'https://github.com/Effect-TS/effect'
const scriptsRoot = dirname(fileURLToPath(import.meta.url))
const appRoot = resolve(scriptsRoot, '..')
const worktreeRoot = findWorktreeRoot()
const effectSourcePath = join(worktreeRoot, '.repos', 'effect')
const effectPackage = JSON.parse(
  readFileSync(
    join(appRoot, 'node_modules', 'effect', 'package.json'),
    'utf-8',
  ),
)
const effectVersion = effectPackage.version

if (
  typeof effectVersion !== 'string' ||
  !/^[0-9A-Za-z][0-9A-Za-z.+-]*$/.test(effectVersion)
) {
  throw new Error('Installed Effect package has an invalid version.')
}

const effectTag = `effect@${effectVersion}`

if (!existsSync(effectSourcePath)) {
  mkdirSync(dirname(effectSourcePath), { recursive: true })
  runGit([
    'clone',
    '--quiet',
    '--depth',
    '1',
    '--single-branch',
    '--branch',
    effectTag,
    process.env.EFFECT_SOURCE_REPOSITORY_URL ?? EFFECT_REPOSITORY_URL,
    effectSourcePath,
  ])
  console.log(`Prepared Effect source ${effectTag}.`)
  process.exit(0)
}

if (!existsSync(join(effectSourcePath, '.git'))) {
  throw new Error(`${effectSourcePath} exists but is not a Git repository.`)
}

const currentTag = readGitTag()

if (currentTag === effectTag) {
  console.log(`Effect source ${effectTag} is already prepared.`)
  process.exit(0)
}

const status = execFileSync(
  'git',
  ['-C', effectSourcePath, 'status', '--porcelain'],
  { encoding: 'utf-8' },
).trim()

if (status) {
  throw new Error(
    `Effect source has local changes at ${effectSourcePath}; expected ${effectTag}.`,
  )
}

runGit([
  '-C',
  effectSourcePath,
  'fetch',
  '--quiet',
  '--depth',
  '1',
  'origin',
  `refs/tags/${effectTag}:refs/tags/${effectTag}`,
])
runGit(['-C', effectSourcePath, 'checkout', '--quiet', '--detach', effectTag])
console.log(`Updated Effect source to ${effectTag}.`)

function findWorktreeRoot() {
  const configuredWorktreeRoot = process.env.T3CODE_WORKTREE_PATH

  if (configuredWorktreeRoot) {
    return realpathSync(configuredWorktreeRoot)
  }

  return realpathSync(
    execFileSync('git', ['-C', appRoot, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf-8',
    }).trim(),
  )
}

function readGitTag() {
  const result = spawnSync(
    'git',
    ['-C', effectSourcePath, 'describe', '--tags', '--exact-match', 'HEAD'],
    { encoding: 'utf-8' },
  )

  if (result.error) {
    throw result.error
  }

  return result.status === 0 ? result.stdout.trim() : null
}

function runGit(args) {
  const result = spawnSync(
    'git',
    ['-c', 'advice.detachedHead=false', ...args],
    {
      cwd: worktreeRoot,
      stdio: 'inherit',
    },
  )

  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

import { execFileSync, spawnSync } from 'node:child_process'
import {
  constants,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  realpathSync,
} from 'node:fs'
import { dirname, join } from 'node:path'

const configuredSourceRoot = process.env.T3CODE_PROJECT_ROOT

if (!configuredSourceRoot) {
  throw new Error('T3CODE_PROJECT_ROOT is required.')
}

const sourceRoot = realpathSync(configuredSourceRoot)
const targetRoot = realpathSync(process.cwd())
const includePath = join(sourceRoot, '.worktreeinclude')

if (!existsSync(includePath)) {
  process.exit(0)
}

const includedPaths = execFileSync(
  'git',
  [
    '-C',
    sourceRoot,
    'ls-files',
    '--others',
    '--ignored',
    '-z',
    `--exclude-from=${includePath}`,
  ],
  { encoding: 'utf-8' },
)
  .split('\0')
  .filter(Boolean)

let copiedFileCount = 0

for (const repositoryRelativePath of includedPaths) {
  if (!isIgnoredByGit(repositoryRelativePath)) {
    continue
  }

  const sourcePath = join(sourceRoot, repositoryRelativePath)
  const targetPath = join(targetRoot, repositoryRelativePath)

  if (!lstatSync(sourcePath).isFile() || existsSync(targetPath)) {
    continue
  }

  mkdirSync(dirname(targetPath), { recursive: true })

  try {
    copyFileSync(sourcePath, targetPath, constants.COPYFILE_EXCL)
    copiedFileCount += 1
  } catch (error) {
    if (!isFileExistsError(error)) {
      throw error
    }
  }
}

console.log(`Applied .worktreeinclude: ${copiedFileCount} file(s) copied.`)

function isIgnoredByGit(repositoryRelativePath) {
  const result = spawnSync(
    'git',
    ['-C', sourceRoot, 'check-ignore', '--quiet', '--', repositoryRelativePath],
    { stdio: 'ignore' },
  )

  if (result.error) {
    throw result.error
  }
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(
      `git check-ignore failed for ${repositoryRelativePath} with exit code ${result.status}.`,
    )
  }

  return result.status === 0
}

function isFileExistsError(error) {
  return error instanceof Error && 'code' in error && error.code === 'EEXIST'
}

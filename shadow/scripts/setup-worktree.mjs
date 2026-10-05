import { execFileSync, spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptsRoot = dirname(fileURLToPath(import.meta.url))
const appRoot = resolve(scriptsRoot, '..')
const worktreeRoot = process.env.T3CODE_WORKTREE_PATH
  ? realpathSync(process.env.T3CODE_WORKTREE_PATH)
  : realpathSync(
      execFileSync('git', ['-C', appRoot, 'rev-parse', '--show-toplevel'], {
        encoding: 'utf-8',
      }).trim(),
    )
const steps = [
  {
    name: 'Copy worktree files',
    command: process.execPath,
    args: [join(scriptsRoot, 'apply-worktreeinclude.mjs')],
    cwd: worktreeRoot,
  },
  {
    name: 'Install packages',
    command: 'pnpm',
    args: ['install', '--frozen-lockfile'],
    cwd: appRoot,
  },
  {
    name: 'Download Effect source',
    command: process.execPath,
    args: [join(scriptsRoot, 'prepare-effect.mjs')],
    cwd: worktreeRoot,
  },
]

for (const [index, step] of steps.entries()) {
  console.log(`[worktree setup ${index + 1}/${steps.length}] ${step.name}`)
  const result = spawnSync(step.command, step.args, {
    cwd: step.cwd,
    env: process.env,
    stdio: 'inherit',
  })

  if (result.error) {
    console.error(`${step.name} failed: ${result.error.message}`)
    process.exit(1)
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

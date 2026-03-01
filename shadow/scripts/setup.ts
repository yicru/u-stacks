import { readFileSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs'
import { basename, resolve, join } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const dirName = basename(ROOT)
const scriptIdx = process.argv.findIndex((a) => a.endsWith('setup.ts'))
const cliName = process.argv[scriptIdx + 1]

const APP_NAME =
  cliName ??
  (dirName !== 'shadow' ? dirName : null) ??
  prompt('Enter your app name:')

if (!APP_NAME) {
  console.error('App name is required.')
  process.exit(1)
}

const jsonTargets = ['package.json', 'wrangler.jsonc', '.cta.json']
const codeTargets = ['src/routes/__root.tsx']

for (const file of jsonTargets) {
  const filePath = join(ROOT, file)
  const content = readFileSync(filePath, 'utf-8')
  writeFileSync(filePath, content.replaceAll('"shadow"', `"${APP_NAME}"`))
}

for (const file of codeTargets) {
  const filePath = join(ROOT, file)
  const content = readFileSync(filePath, 'utf-8')
  writeFileSync(filePath, content.replaceAll("'shadow'", `'${APP_NAME}'`))
}

unlinkSync(join(ROOT, 'scripts/setup.ts'))
rmdirSync(join(ROOT, 'scripts'))

console.log(`\u2728 Project renamed to "${APP_NAME}"`)

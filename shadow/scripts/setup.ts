import { readFileSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs'
import { basename, resolve, join } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const APP_NAME = basename(ROOT)

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

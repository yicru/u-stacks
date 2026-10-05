import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { expect, test } from 'vite-plus/test'

const ROOT = resolve(import.meta.dirname, '..')

test('bounds nested patterns and ASTs while preserving normal brace expansion', () => {
  runNode(`
const assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const scaffdogRequire = createRequire(require.resolve('./node_modules/scaffdog/package.json'))
const micromatchRequire = createRequire(scaffdogRequire.resolve('micromatch'))
const braces = micromatchRequire('braces')
assert.deepEqual(braces.expand('src/{a,b}/{1..2}.ts'), ['src/a/1.ts', 'src/a/2.ts', 'src/b/1.ts', 'src/b/2.ts'])
assert.equal(braces.compile('src/{a,b}.ts'), 'src/(a|b).ts')
assert.equal(braces.stringify(braces.parse('src/{a,b}.ts')), 'src/{a,b}.ts')
for (const [open, close] of [['{', '}'], ['(', ')']]) {
  const pattern = open.repeat(4000) + 'a,b' + close.repeat(4000)
  assert.throws(() => braces.parse(pattern), { name: 'SyntaxError', message: /nesting depth/ })
}
const ast = braces.parse('{a,b}')
let parent = ast.nodes[1]
for (let depth = 0; depth < 4000; depth++) {
  const child = braces.parse('{a,b}').nodes[1]
  parent.nodes.splice(1, 3, child)
  child.parent = parent
  parent = child
}
for (const operation of [braces.compile, braces.expand, braces.stringify]) {
  assert.throws(() => operation(ast), { name: 'SyntaxError', message: /nesting depth/ })
}
`)
})

test('rejects extra DigestAlgorithm elements and accepts valid RSA signatures', () => {
  runNode(`
const assert = require('node:assert/strict')
const { generateKeyPairSync } = require('node:crypto')
const { createRequire } = require('node:module')
const dotenvxRequire = createRequire(require.resolve('@dotenvx/dotenvx'))
const forge = dotenvxRequire('node-forge')
const { privateKey: pem } = generateKeyPairSync('rsa', {
  modulusLength: 1024,
  publicExponent: 3,
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
})
const privateKey = forge.pki.privateKeyFromPem(pem)
const publicKey = forge.pki.rsa.setPublicKey(privateKey.n, privateKey.e)
const digest = forge.md.sha256.create().update('dependency regression').digest().getBytes()
const asn1 = forge.asn1
const universal = asn1.Class.UNIVERSAL
const oid = asn1.create(universal, asn1.Type.OID, false, asn1.oidToDer(forge.oids.sha256).getBytes())
const parameters = asn1.create(universal, asn1.Type.NULL, false, '')
const garbage = asn1.create(universal, asn1.Type.OCTETSTRING, false, 'unconsumed')
for (const children of [[oid], [oid, parameters], [oid, garbage], [oid, parameters, garbage]]) {
  const info = asn1.create(universal, asn1.Type.SEQUENCE, true, [
    asn1.create(universal, asn1.Type.SEQUENCE, true, children),
    asn1.create(universal, asn1.Type.OCTETSTRING, false, digest),
  ])
  const signature = forge.pki.rsa.encrypt(asn1.toDer(info).getBytes(), privateKey, 0x01)
  if (children.includes(garbage)) {
    assert.throws(() => publicKey.verify(digest, signature), /valid RSASSA-PKCS1-v1_5 DigestInfo/)
  } else {
    assert.equal(publicKey.verify(digest, signature), true)
  }
}
`)
})

function runNode(source: string): void {
  const result = spawnSync('node', ['--input-type=commonjs', '-e', source], {
    cwd: ROOT,
    encoding: 'utf-8',
    timeout: 10_000,
  })
  expect(result.status, result.stderr).toBe(0)
}

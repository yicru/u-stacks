import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { WorkerConfig } from 'cf/config'

const RESOURCE_IDS_PATH = resolve(
  import.meta.dirname,
  '..',
  'cloudflare.resources.json',
)

type ResourceIdentifier = { type: string; id: string }
type ResourceIdentifiers = Record<
  string,
  Record<string, Record<string, ResourceIdentifier>>
>

export function withCloudflareResourceIds<const T extends WorkerConfig>(
  worker: T,
  accountId?: string,
): T {
  if (!accountId) return worker
  const identifiers = readIdentifiers()[accountId]?.[worker.name] ?? {}

  for (const [name, binding] of Object.entries(worker.env ?? {})) {
    const stored = identifiers[name]
    if (!stored) continue
    if (stored.type !== binding.type) {
      throw new Error(
        `Stored Cloudflare resource type differs for ${name}. Review cloudflare.resources.json.`,
      )
    }
    if (binding.type === 'kv' || binding.type === 'd1') {
      binding.id ||= stored.id
    } else if (binding.type === 'r2') {
      binding.name ||= stored.id
    }
  }

  return worker
}

export function storeCloudflareResourceId(
  accountId: string,
  workerName: string,
  binding: string,
  type: string,
  id: string,
): void {
  const identifiers = readIdentifiers()
  identifiers[accountId] ??= {}
  identifiers[accountId][workerName] ??= {}
  identifiers[accountId][workerName][binding] = { type, id }
  writeFileSync(RESOURCE_IDS_PATH, `${JSON.stringify(identifiers, null, 2)}\n`)
}

function readIdentifiers(): ResourceIdentifiers {
  if (!existsSync(RESOURCE_IDS_PATH)) return {}
  const value: unknown = JSON.parse(readFileSync(RESOURCE_IDS_PATH, 'utf-8'))
  if (!isRecord(value)) throw new Error('Invalid cloudflare.resources.json.')
  for (const workers of Object.values(value)) {
    if (!isRecord(workers))
      throw new Error('Invalid Cloudflare resource account.')
    for (const bindings of Object.values(workers)) {
      if (!isRecord(bindings))
        throw new Error('Invalid Cloudflare resource Worker.')
      for (const identifier of Object.values(bindings)) {
        if (
          !isRecord(identifier) ||
          typeof identifier.type !== 'string' ||
          typeof identifier.id !== 'string' ||
          !identifier.id
        ) {
          throw new Error('Invalid Cloudflare resource identifier.')
        }
      }
    }
  }
  return value as ResourceIdentifiers
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

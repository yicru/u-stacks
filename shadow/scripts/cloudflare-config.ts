export type CloudflareAccount = {
  id: string
  name: string
}

export type CloudflareConfiguration = {
  profile: string
  accountId: string
}

const CLOUDFLARE_CREDENTIAL_ENV_NAMES = [
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_API_KEY',
  'CLOUDFLARE_EMAIL',
  'CF_API_TOKEN',
  'CF_API_KEY',
  'CF_EMAIL',
] as const

export function parseCloudflareConfiguration(
  value: unknown,
): CloudflareConfiguration | null {
  const profile = readCloudflareProfile(value)
  if (!profile) {
    return null
  }

  const accountId = readCloudflareAccountId(value, 'accountId')
  if (!accountId) {
    return null
  }

  return { profile, accountId }
}

export function parseCloudflareAccounts(value: unknown): CloudflareAccount[] {
  const accountValues = readArray(value, 'accounts') ?? []
  return accountValues.map(parseCloudflareAccount).filter(isCloudflareAccount)
}

export function isNamedCloudflareProfile(value: string): boolean {
  return value.toLowerCase() !== 'default' && /^[a-zA-Z0-9_-]+$/.test(value)
}

export function findCloudflareCredentialEnvironmentVariable(
  environment: Record<string, string | undefined>,
): string | null {
  return (
    CLOUDFLARE_CREDENTIAL_ENV_NAMES.find((name) => environment[name]) ?? null
  )
}

export function suppressCloudflareCredentialEnvironmentVariables(
  environment: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const suppressedEnvironment = { ...environment }
  for (const name of CLOUDFLARE_CREDENTIAL_ENV_NAMES) {
    suppressedEnvironment[name] = ''
  }
  return suppressedEnvironment
}

function parseCloudflareAccount(value: unknown): CloudflareAccount | null {
  const id = readCloudflareAccountId(value, 'id')
  if (!id) {
    return null
  }

  const name = readNonEmptyString(value, 'name')
  if (!name) {
    return null
  }

  return { id, name }
}

function isCloudflareAccount(
  value: CloudflareAccount | null,
): value is CloudflareAccount {
  return value !== null
}

function isCloudflareAccountId(value: string): boolean {
  return value.length === 32
}

function readCloudflareProfile(value: unknown): string | null {
  const profile = readNonEmptyString(value, 'profile')
  return profile && isNamedCloudflareProfile(profile) ? profile : null
}

function readCloudflareAccountId(value: unknown, key: string): string | null {
  const accountId = readNonEmptyString(value, key)
  return accountId && isCloudflareAccountId(accountId) ? accountId : null
}

function readNonEmptyString(value: unknown, key: string): string | null {
  if (!isRecord(value)) {
    return null
  }

  const property = value[key]
  if (typeof property !== 'string') {
    return null
  }

  return property || null
}

function readArray(value: unknown, key: string): unknown[] | null {
  if (!isRecord(value)) {
    return null
  }

  const property = value[key]
  return Array.isArray(property) ? property : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

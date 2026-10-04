import { bindings, defineConfig } from 'cf/config'
import { withCloudflareResourceIds } from './scripts/cloudflare-resource-ids.ts'

const accountId: string | undefined = undefined

export default defineConfig(() => ({
  accountId,
  worker: withCloudflareResourceIds(
    {
      name: 'shadow',
      compatibilityDate: '2025-09-02',
      compatibilityFlags: ['nodejs_compat'],
      entrypoint: '@tanstack/react-start/server-entry',
      observability: { enabled: true },
      env: {
        TURSO_DATABASE_URL: bindings.secret(),
        TURSO_AUTH_TOKEN: bindings.secret(),
      },
    },
    accountId,
  ),
}))

import { bindings, defineConfig } from 'cf/config'
import { withCloudflareResourceIds } from './scripts/cloudflare-resource-ids.ts'

const accountId: string | undefined = undefined

export default defineConfig(() => ({
  accountId,
  worker: withCloudflareResourceIds(
    {
      name: 'shadow',
      compatibilityDate: '2026-09-30',
      entrypoint: '@tanstack/react-start/server-entry',
      placement: { region: 'aws:ap-northeast-1' },
      observability: {
        enabled: true,
        logs: { enabled: true, headSamplingRate: 1 },
        traces: { enabled: true, headSamplingRate: 0.01 },
      },
      env: {
        TURSO_DATABASE_URL: bindings.secret(),
        TURSO_AUTH_TOKEN: bindings.secret(),
      },
    },
    accountId,
  ),
}))

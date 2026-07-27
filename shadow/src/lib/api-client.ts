import {
  FetchHttpClient,
  HttpApiClient,
} from '@effect/platform'
import { Effect, Layer } from 'effect'
import { ShadowApi } from '@shared/api'

interface ApiClientOptions {
  readonly baseUrl?: string
  readonly fetch?: typeof globalThis.fetch
}

export const makeApiClient = ({
  baseUrl = '',
  fetch,
}: ApiClientOptions = {}) => {
  const httpClientLayer = fetch
    ? FetchHttpClient.layer.pipe(
        Layer.provide(
          Layer.succeed(FetchHttpClient.Fetch, fetch),
        ),
      )
    : FetchHttpClient.layer

  return Effect.runSync(
    HttpApiClient.make(ShadowApi, { baseUrl }).pipe(
      Effect.provide(httpClientLayer),
    ),
  )
}

export const apiClient = makeApiClient({
  baseUrl: import.meta.env.VITE_API_URL ?? '',
})

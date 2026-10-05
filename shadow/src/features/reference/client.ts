import { Effect } from 'effect'
import { FetchHttpClient } from 'effect/http'
import { HttpApiClient } from 'effect/http-api'
import { ReferenceApi } from '@shared/api/reference'

export const referenceClient = Effect.runSync(
  HttpApiClient.make(ReferenceApi, {
    baseUrl: import.meta.env.VITE_API_URL ?? '',
  }).pipe(Effect.provide(FetchHttpClient.layer)),
)

import { Schema } from 'effect'

export const HealthCheckResponse = Schema.Struct({
  message: Schema.Literal('ok'),
})

export type HealthCheckResponse = Schema.Schema.Type<typeof HealthCheckResponse>

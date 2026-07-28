import { Schema } from 'effect'

export namespace ApiError {
  export const Validation = Schema.Struct({
    code: Schema.Literal('VALIDATION_ERROR'),
    message: Schema.String,
    detail: Schema.Array(Schema.Unknown),
  })
  export type Validation = Schema.Schema.Type<typeof Validation>

  export const NotFound = Schema.Struct({
    code: Schema.Literal('NOT_FOUND'),
    message: Schema.String,
  })
  export type NotFound = Schema.Schema.Type<typeof NotFound>

  export const Internal = Schema.Struct({
    code: Schema.Literal('INTERNAL_ERROR'),
    message: Schema.String,
  })
  export type Internal = Schema.Schema.Type<typeof Internal>

  export const validation = (detail: ReadonlyArray<unknown>): Validation => ({
    code: 'VALIDATION_ERROR',
    message: 'Validation Error',
    detail,
  })

  export const notFound = (message: string): NotFound => ({
    code: 'NOT_FOUND',
    message,
  })

  export const internal = (): Internal => ({
    code: 'INTERNAL_ERROR',
    message: 'Internal Server Error',
  })
}

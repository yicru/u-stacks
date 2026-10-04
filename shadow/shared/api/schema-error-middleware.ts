import { Effect } from 'effect'
import { HttpApiError, HttpApiMiddleware } from 'effect/http-api'
import { ValidationError } from './errors'

export class SchemaErrorMiddleware extends HttpApiMiddleware.Service<SchemaErrorMiddleware>()(
  'app/SchemaErrorMiddleware',
  {
    error: ValidationError,
  },
) {}

export const SchemaErrorMiddlewareLive =
  HttpApiMiddleware.layerSchemaErrorTransform(
    SchemaErrorMiddleware,
    (schemaError: HttpApiError.HttpApiSchemaError) =>
      Effect.fail(
        ValidationError.makeValidation([
          {
            kind: schemaError.kind,
            message: schemaError.cause.message,
          },
        ]),
      ),
  )

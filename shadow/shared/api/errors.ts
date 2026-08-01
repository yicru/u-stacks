import { Schema } from 'effect'

export class ValidationError extends Schema.Class<ValidationError>(
  'ValidationError',
)(
  {
    code: Schema.Literal('VALIDATION_ERROR'),
    message: Schema.String,
    detail: Schema.Array(Schema.Unknown),
  },
  { httpApiStatus: 400 },
) {
  static readonly makeValidation = (detail: ReadonlyArray<unknown>) =>
    ValidationError.make({
      code: 'VALIDATION_ERROR',
      message: 'Validation Error',
      detail,
    })
}

export class NotFoundError extends Schema.Class<NotFoundError>('NotFoundError')(
  {
    code: Schema.Literal('NOT_FOUND'),
    message: Schema.String,
  },
  { httpApiStatus: 404 },
) {
  static readonly makeNotFound = (message: string) =>
    NotFoundError.make({
      code: 'NOT_FOUND',
      message,
    })
}

export class InternalError extends Schema.Class<InternalError>('InternalError')(
  {
    code: Schema.Literal('INTERNAL_ERROR'),
    message: Schema.String,
  },
  { httpApiStatus: 500 },
) {
  static readonly makeInternal = () =>
    InternalError.make({
      code: 'INTERNAL_ERROR',
      message: 'Internal Server Error',
    })
}

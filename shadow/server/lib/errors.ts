const ErrorCode = {
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const

type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode]

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: ErrorCodeType,
    public override message: string,
    public detail?: unknown,
  ) {
    super(message)
  }

  toResponse() {
    return Response.json(
      { code: this.code, message: this.message, detail: this.detail },
      { status: this.status },
    )
  }
}

export class BadRequestError extends ApiError {
  constructor(message = 'Bad Request', detail?: unknown) {
    super(400, ErrorCode.BAD_REQUEST, message, detail)
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Unauthorized') {
    super(401, ErrorCode.UNAUTHORIZED, message)
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = 'Forbidden') {
    super(403, ErrorCode.FORBIDDEN, message)
  }
}

export class NotFoundError extends ApiError {
  constructor(message = 'Not Found') {
    super(404, ErrorCode.NOT_FOUND, message)
  }
}

export class ValidationError extends ApiError {
  constructor(message = 'Validation Error', detail?: unknown) {
    super(400, ErrorCode.VALIDATION_ERROR, message, detail)
  }
}

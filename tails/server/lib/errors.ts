import { ErrorCode, type ErrorCodeType } from '@server/types/api'
import { HTTPException } from 'hono/http-exception'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

export class ApiError extends HTTPException {
  readonly code: ErrorCodeType

  constructor(
    status: ContentfulStatusCode,
    code: ErrorCodeType,
    message: string,
    options?: { details?: unknown },
  ) {
    super(status, {
      message,
      cause: {
        code,
        details: options?.details,
      },
    })
    this.code = code
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = '認証が必要です') {
    super(401, ErrorCode.UNAUTHORIZED, message)
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = 'アクセス権限がありません') {
    super(403, ErrorCode.FORBIDDEN, message)
  }
}

export class NotFoundError extends ApiError {
  constructor(message = 'リソースが見つかりません') {
    super(404, ErrorCode.NOT_FOUND, message)
  }
}

export class ValidationError extends ApiError {
  constructor(message = 'バリデーションエラー', details?: unknown) {
    super(400, ErrorCode.VALIDATION_ERROR, message, { details })
  }
}

export class InternalError extends ApiError {
  constructor(message = 'サーバーエラーが発生しました', details?: unknown) {
    super(500, ErrorCode.INTERNAL_ERROR, message, { details })
  }
}

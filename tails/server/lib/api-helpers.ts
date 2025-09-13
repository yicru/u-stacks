import type { ApiResponse } from '@server/types/api'
import type { Context } from 'hono'

/**
 * Creates a successful API response
 */
export const createSuccessResponse = <T>(data: T): ApiResponse<T> => ({
  success: true,
  data,
})

/**
 * Creates an error API response
 */
export const createErrorResponse = (
  code: string,
  message: string,
  details?: unknown,
): ApiResponse => ({
  success: false,
  error: {
    code,
    message,
    details: process.env.NODE_ENV === 'development' ? details : undefined,
  },
})

/**
 * Logs an error with context (only in non-test environments)
 */
export const logError = (context: string, error: unknown) => {
  if (process.env.NODE_ENV !== 'test') {
    console.error(`[API Error] ${context}:`, error)
  }
}

/**
 * Returns a successful JSON response
 */
export const successResponse = <T>(c: Context, data: T) => {
  return c.json(createSuccessResponse(data))
}

/**
 * Returns an error JSON response
 */
export const errorResponse = (
  c: Context,
  code: string,
  message: string,
  error?: unknown,
) => {
  logError(message, error)
  return c.json(createErrorResponse(code, message, error), 500)
}

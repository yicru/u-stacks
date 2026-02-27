import { zValidator as honoZValidator } from '@hono/zod-validator'
import type { ValidationTargets } from 'hono'
import type { ZodSchema } from 'zod'
import { ValidationError } from '@server/lib/errors'

export const zValidator = <
  T extends ZodSchema,
  Target extends keyof ValidationTargets,
>(
  target: Target,
  schema: T,
) => {
  return honoZValidator(target, schema, (result) => {
    if (!result.success) {
      throw new ValidationError('Validation Error', result.error.issues)
    }
  })
}

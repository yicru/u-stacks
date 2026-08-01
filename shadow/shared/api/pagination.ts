import { Effect, Schema } from 'effect'

const Page = Schema.NumberFromString.check(
  Schema.isInt(),
  Schema.isGreaterThanOrEqualTo(1),
)

const PerPage = Schema.NumberFromString.check(
  Schema.isInt(),
  Schema.isBetween({ minimum: 1, maximum: 50 }),
)

export const PaginationQuery = Schema.Struct({
  page: Page.pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(1))),
  perPage: PerPage.pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(10))),
})

export const PaginationMeta = Schema.Struct({
  page: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1)),
  perPage: Schema.Number.check(
    Schema.isInt(),
    Schema.isBetween({ minimum: 1, maximum: 50 }),
  ),
  total: Schema.Natural,
  totalPages: Schema.Natural,
})
export type PaginationMeta = typeof PaginationMeta.Type

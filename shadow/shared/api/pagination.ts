import { Schema } from 'effect'

const Page = Schema.NumberFromString.pipe(
  Schema.int(),
  Schema.greaterThanOrEqualTo(1),
)

const PerPage = Schema.NumberFromString.pipe(
  Schema.int(),
  Schema.between(1, 50),
)

export const PaginationQuery = Schema.Struct({
  page: Schema.optionalWith(Page, { default: () => 1 }),
  perPage: Schema.optionalWith(PerPage, { default: () => 10 }),
})

export const PaginationMeta = Schema.Struct({
  page: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1)),
  perPage: Schema.Number.pipe(Schema.int(), Schema.between(1, 50)),
  total: Schema.NonNegativeInt,
  totalPages: Schema.NonNegativeInt,
})
export type PaginationMeta = Schema.Schema.Type<typeof PaginationMeta>

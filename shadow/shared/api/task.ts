import { Schema } from 'effect'

const Page = Schema.NumberFromString.pipe(
  Schema.int(),
  Schema.greaterThanOrEqualTo(1),
)

const PerPage = Schema.NumberFromString.pipe(
  Schema.int(),
  Schema.between(1, 50),
)

export const Task = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  done: Schema.Boolean,
  createdAt: Schema.DateFromString,
  updatedAt: Schema.DateFromString,
})
export type Task = Schema.Schema.Type<typeof Task>

export const TaskListQuery = Schema.Struct({
  page: Schema.optionalWith(Page, { default: () => 1 }),
  perPage: Schema.optionalWith(PerPage, { default: () => 10 }),
})
export type TaskListQuery = Schema.Schema.Type<typeof TaskListQuery>

export const PaginationMeta = Schema.Struct({
  page: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1)),
  perPage: Schema.Number.pipe(Schema.int(), Schema.between(1, 50)),
  total: Schema.NonNegativeInt,
  totalPages: Schema.NonNegativeInt,
})
export type PaginationMeta = Schema.Schema.Type<typeof PaginationMeta>

export const TaskListResponse = Schema.Struct({
  data: Schema.Array(Task),
  meta: PaginationMeta,
})
export type TaskListResponse = Schema.Schema.Type<typeof TaskListResponse>

export const TaskPath = Schema.Struct({
  id: Schema.String.pipe(Schema.minLength(1)),
})
export type TaskPath = Schema.Schema.Type<typeof TaskPath>

export const TaskCreateBody = Schema.Struct({
  title: Schema.String.pipe(Schema.minLength(1)),
  done: Schema.optional(Schema.Boolean),
})
export type TaskCreateBody = Schema.Schema.Type<typeof TaskCreateBody>

export const TaskUpdateBody = Schema.Struct({
  title: Schema.optional(Schema.String.pipe(Schema.minLength(1))),
  done: Schema.optional(Schema.Boolean),
})
export type TaskUpdateBody = Schema.Schema.Type<typeof TaskUpdateBody>

export const TaskResponse = Schema.Struct({ data: Task })
export type TaskResponse = Schema.Schema.Type<typeof TaskResponse>

export const TaskDeleteResponse = Schema.Struct({
  success: Schema.Literal(true),
})
export type TaskDeleteResponse = Schema.Schema.Type<typeof TaskDeleteResponse>

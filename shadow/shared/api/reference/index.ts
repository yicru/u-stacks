import { Effect, Result, Schema } from 'effect'
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from 'effect/http-api'
import { InternalError } from '../errors'
import { SchemaErrorMiddleware } from '../schema-error-middleware'
import { Task } from '../task'

const Cursor = Schema.StringFromBase64Url.pipe(
  Schema.decodeTo(
    Schema.fromJsonString(
      Schema.Struct({
        createdAt: Schema.DateFromString,
        id: Schema.String.check(Schema.isMinLength(1)),
      }),
    ),
  ),
)

export const decodeCursor = Schema.decodeUnknownEffect(Cursor)
export const encodeCursor = Schema.encodeSync(Cursor)

const CursorToken = Schema.String.check(
  Schema.isMaxLength(512),
  Schema.makeFilter(
    (value) => Result.isSuccess(Schema.decodeUnknownResult(Cursor)(value)),
    { message: 'Invalid task cursor' },
  ),
)

export const ReferenceSearch = Schema.Struct({
  cursor: Schema.optional(CursorToken),
  mode: Schema.Literals(['stream', 'parallel']).pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed('stream')),
  ),
})

const ReferencePageQuery = Schema.Struct({
  cursor: Schema.optional(CursorToken),
  limit: Schema.NumberFromString.check(
    Schema.isInt(),
    Schema.isBetween({ minimum: 1, maximum: 20 }),
  ).pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(10))),
})
export type ReferencePageQuery = typeof ReferencePageQuery.Type

const ReferencePage = Schema.Struct({
  data: Schema.Array(Task),
  nextCursor: Schema.NullOr(CursorToken),
})
export type ReferencePage = typeof ReferencePage.Type

const ReferenceSummary = Schema.Struct({
  total: Schema.Natural,
  open: Schema.Natural,
  done: Schema.Natural,
})
export type ReferenceSummary = typeof ReferenceSummary.Type

const ReferenceOverview = Schema.Struct({
  page: ReferencePage,
  summary: ReferenceSummary,
})
export type ReferenceOverview = typeof ReferenceOverview.Type

const ReferenceLookupBody = Schema.Struct({
  ids: Schema.Array(Schema.String.check(Schema.isMinLength(1))).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(20),
  ),
})

const ReferenceLookup = Schema.Struct({
  data: Schema.Array(Task),
  missingIds: Schema.Array(Schema.String),
})
export type ReferenceLookup = typeof ReferenceLookup.Type

const ReferenceGroup = HttpApiGroup.make('reference')
  .add(
    HttpApiEndpoint.get('getPage', '/tasks', {
      query: ReferencePageQuery,
      success: ReferencePage,
      error: InternalError,
    }),
  )
  .add(
    HttpApiEndpoint.get('getSummary', '/summary', {
      success: ReferenceSummary,
      error: InternalError,
    }),
  )
  .add(
    HttpApiEndpoint.get('getOverview', '/overview', {
      query: ReferencePageQuery,
      success: ReferenceOverview,
      error: InternalError,
    }),
  )
  .add(
    HttpApiEndpoint.post('lookupTasks', '/lookup', {
      payload: ReferenceLookupBody,
      success: ReferenceLookup,
      error: InternalError,
    }),
  )

export class ReferenceApi extends HttpApi.make('reference')
  .add(ReferenceGroup)
  .middleware(SchemaErrorMiddleware)
  .prefix('/api/reference') {}

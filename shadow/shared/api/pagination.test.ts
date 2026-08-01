import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { PaginationQuery } from './pagination'

describe('PaginationQuery', () => {
  it('uses the pagination defaults', () => {
    expect(Schema.decodeUnknownSync(PaginationQuery)({})).toEqual({
      page: 1,
      perPage: 10,
    })
  })

  it('decodes valid query strings', () => {
    expect(
      Schema.decodeUnknownSync(PaginationQuery)({
        page: '2',
        perPage: '25',
      }),
    ).toEqual({ page: 2, perPage: 25 })
  })

  it('rejects pagination outside the accepted range', () => {
    expect(
      Schema.decodeUnknownResult(PaginationQuery)({
        page: '0',
        perPage: '51',
      })._tag,
    ).toBe('Failure')
  })
})

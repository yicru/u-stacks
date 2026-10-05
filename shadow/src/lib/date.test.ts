import { describe, expect, it } from 'vite-plus/test'
import { formatDateTime } from './date'

describe('formatDateTime', () => {
  it.each([
    ['2026-10-04T15:00:00Z', '2026/10/05 00:00'],
    ['2026-12-31T23:59:00Z', '2027/01/01 08:59'],
    ['2026-07-28T00:00:00Z', '2026/07/28 09:00'],
    [new Date('2026-10-05T03:04:00Z'), '2026/10/05 12:04'],
  ])('formats %s in Tokyo time as %s', (date, expected) => {
    expect(formatDateTime(date)).toBe(expected)
  })

  it('rejects invalid dates', () => {
    expect(() => formatDateTime('invalid')).toThrow(RangeError)
  })
})

import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Task, TaskCreateBody, TaskUpdateBody } from './task'

describe('Task payloads', () => {
  it('requires a non-empty title when creating a task', () => {
    expect(Schema.decodeUnknownEither(TaskCreateBody)({ title: '' })._tag).toBe(
      'Left',
    )
  })

  it('accepts an empty update body for compatibility', () => {
    expect(Schema.decodeUnknownSync(TaskUpdateBody)({})).toEqual({})
  })
})

describe('Task', () => {
  it('encodes dates as ISO strings', () => {
    const encoded = Schema.encodeSync(Task)({
      id: 'task_1',
      title: 'Write tests',
      done: false,
      createdAt: new Date('2026-07-28T00:00:00.000Z'),
      updatedAt: new Date('2026-07-28T01:00:00.000Z'),
    })

    expect(encoded.createdAt).toBe('2026-07-28T00:00:00.000Z')
    expect(encoded.updatedAt).toBe('2026-07-28T01:00:00.000Z')
  })
})

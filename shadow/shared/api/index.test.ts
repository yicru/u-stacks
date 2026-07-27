import { describe, expect, it } from 'vitest'
import { ShadowApi } from './index'

describe('ShadowApi', () => {
  it('declares the health check and task groups', () => {
    expect(Object.keys(ShadowApi.groups)).toEqual(['healthCheck', 'tasks'])
  })

  it('declares every existing task operation', () => {
    expect(Object.keys(ShadowApi.groups.tasks.endpoints)).toEqual([
      'list',
      'get',
      'create',
      'update',
      'remove',
    ])
  })

  it('keeps the existing methods and paths', () => {
    const endpoints = ShadowApi.groups.tasks.endpoints

    expect([endpoints.list.method, endpoints.list.path]).toEqual([
      'GET',
      '/api/tasks',
    ])
    expect([endpoints.get.method, endpoints.get.path]).toEqual([
      'GET',
      '/api/tasks/:id',
    ])
    expect([endpoints.create.method, endpoints.create.path]).toEqual([
      'POST',
      '/api/tasks',
    ])
    expect([endpoints.update.method, endpoints.update.path]).toEqual([
      'PUT',
      '/api/tasks/:id',
    ])
    expect([endpoints.remove.method, endpoints.remove.path]).toEqual([
      'DELETE',
      '/api/tasks/:id',
    ])
  })
})

import { describe, expect, it } from 'vitest'
import { ShadowApi } from './index'

describe('ShadowApi', () => {
  it('declares the health check and task groups', () => {
    expect(Object.keys(ShadowApi.groups)).toEqual(['healthCheck', 'tasks'])
  })

  it('declares every existing task operation', () => {
    expect(Object.keys(ShadowApi.groups.tasks.endpoints)).toEqual([
      'getTasks',
      'getTask',
      'createTask',
      'updateTask',
      'deleteTask',
    ])
  })

  it('keeps the existing methods and paths', () => {
    const endpoints = ShadowApi.groups.tasks.endpoints

    expect([endpoints.getTasks.method, endpoints.getTasks.path]).toEqual([
      'GET',
      '/api/tasks',
    ])
    expect([endpoints.getTask.method, endpoints.getTask.path]).toEqual([
      'GET',
      '/api/tasks/:id',
    ])
    expect([endpoints.createTask.method, endpoints.createTask.path]).toEqual([
      'POST',
      '/api/tasks',
    ])
    expect([endpoints.updateTask.method, endpoints.updateTask.path]).toEqual([
      'PUT',
      '/api/tasks/:id',
    ])
    expect([endpoints.deleteTask.method, endpoints.deleteTask.path]).toEqual([
      'DELETE',
      '/api/tasks/:id',
    ])
  })
})

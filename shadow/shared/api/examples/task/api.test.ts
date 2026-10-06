import { describe, expect, it } from 'vite-plus/test'
import { AppApi } from '@shared/api'

describe('AppApi', () => {
  it('declares the health check and task groups', () => {
    expect(Object.keys(AppApi.groups)).toEqual(['healthCheck', 'tasks'])
  })

  it('keeps the existing methods and paths', () => {
    const endpoints = AppApi.groups.tasks.endpoints

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

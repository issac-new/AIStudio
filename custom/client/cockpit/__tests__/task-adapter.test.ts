import { describe, it, expect } from 'vitest'
import { bucketPriority, bucketStatus, toCockpitTask } from '@/custom/cockpit/adapters/task-adapter'
import type { KanbanTask } from '@/api/hermes/kanban'

const baseTask = (over: Partial<KanbanTask> = {}): KanbanTask => ({
  id: 't1', title: 'T', body: null, assignee: 'alice', status: 'todo',
  priority: 0, created_by: null, created_at: 0, started_at: null, completed_at: null,
  workspace_kind: 'dir', workspace_path: '~/ws', tenant: null, project_id: null,
  result: null, skills: null, latest_summary: null,
  ...over,
})

describe('bucketPriority', () => {
  it('maps >=3 to P0', () => {
    expect(bucketPriority(3)).toBe('P0')
    expect(bucketPriority(5)).toBe('P0')
    expect(bucketPriority(100)).toBe('P0')
  })
  it('maps 2 to P1', () => { expect(bucketPriority(2)).toBe('P1') })
  it('maps 1 to P2', () => { expect(bucketPriority(1)).toBe('P2') })
  it('maps 0/null/undefined/negative to P3', () => {
    expect(bucketPriority(0)).toBe('P3')
    expect(bucketPriority(null)).toBe('P3')
    expect(bucketPriority(undefined)).toBe('P3')
    expect(bucketPriority(-1)).toBe('P3')
  })
})

describe('bucketStatus', () => {
  it('review → review', () => { expect(bucketStatus('review')).toBe('review') })
  it('blocked → blocked', () => { expect(bucketStatus('blocked')).toBe('blocked') })
  it('running/ready/scheduled → running', () => {
    expect(bucketStatus('running')).toBe('running')
    expect(bucketStatus('ready')).toBe('running')
    expect(bucketStatus('scheduled')).toBe('running')
  })
  it('triage/todo → todo', () => {
    expect(bucketStatus('triage')).toBe('todo')
    expect(bucketStatus('todo')).toBe('todo')
  })
  it('done/archived → done', () => {
    expect(bucketStatus('done')).toBe('done')
    expect(bucketStatus('archived')).toBe('done')
  })
})

describe('toCockpitTask', () => {
  it('maps core fields + bucketed priority + tenant + boardSlug + createdAt (s→ms), drops category', () => {
    // created_at=1000 是秒级（< 1e12），转为毫秒 1000*1000
    const t = toCockpitTask(baseTask({ id: 't9', title: 'Hello', priority: 3, status: 'review', assignee: 'bob', workspace_path: '~/ws/x', tenant: 'matrix:!r:s.ms:Auth', created_at: 1000 }), 'auth-svc')
    expect(t).toEqual({
      id: 't9', title: 'Hello', priority: 'P0', status: 'review',
      assignee: 'bob', workspace: '~/ws/x', tenant: 'matrix:!r:s.ms:Auth',
      boardSlug: 'auth-svc', createdAt: 1000000,
    })
    expect(t).not.toHaveProperty('category')
  })
  it('null assignee → 未分配; null workspace → ~', () => {
    const t = toCockpitTask(baseTask({ assignee: null, workspace_path: null }))
    expect(t.assignee).toBe('未分配')
    expect(t.workspace).toBe('~')
  })
  it('defaults boardSlug to default when not provided', () => {
    const t = toCockpitTask(baseTask({ id: 'x' }))
    expect(t.boardSlug).toBe('default')
  })
})

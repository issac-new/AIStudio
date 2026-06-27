import { describe, it, expect } from 'vitest'
import { toAttention } from '@/custom/cockpit/adapters/attention-adapter'
import type { KanbanTask } from '@/api/hermes/kanban'

const t = (over: Partial<KanbanTask> = {}): KanbanTask => ({
  id: 't1', title: 'T', body: null, assignee: null, status: 'todo',
  priority: 0, created_by: null, created_at: 0, started_at: null, completed_at: null,
  workspace_kind: 'dir', workspace_path: null, tenant: null, project_id: null,
  result: null, skills: null, latest_summary: null, ...over,
})

describe('toAttention', () => {
  it('blocked → high severity, prefix 阻塞', () => {
    const out = toAttention(t({ id: 'b1', title: 'X', status: 'blocked', priority: 2, created_at: 100 }))
    expect(out).toMatchObject({ id: 'att-b1', taskId: 'b1', severity: 'high', title: '阻塞 · X' })
    expect(out?.priority).toBe(2)
    expect(out?.status).toBe('blocked')
  })
  it('review → medium severity, prefix 待审', () => {
    const out = toAttention(t({ id: 'r1', title: 'Y', status: 'review' }))
    expect(out).toMatchObject({ id: 'att-r1', taskId: 'r1', severity: 'medium', title: '待审 · Y' })
  })
  it('triage → high severity, prefix 待分类', () => {
    const out = toAttention(t({ id: 't1', title: 'Z', status: 'triage' }))
    expect(out).toMatchObject({ id: 'att-t1', taskId: 't1', severity: 'high', title: '待分类 · Z' })
  })
  it('other statuses → null', () => {
    for (const s of ['todo', 'running', 'ready', 'scheduled', 'done', 'archived'] as const) {
      expect(toAttention(t({ status: s }))).toBeNull()
    }
  })
})

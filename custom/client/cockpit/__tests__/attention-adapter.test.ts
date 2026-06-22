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
    expect(toAttention(t({ id: 'b1', title: 'X', status: 'blocked' }))).toEqual({
      id: 'att-b1', taskId: 'b1', severity: 'high', title: '阻塞 · X',
    })
  })
  it('review → medium severity, prefix 待审', () => {
    expect(toAttention(t({ id: 'r1', title: 'Y', status: 'review' }))).toEqual({
      id: 'att-r1', taskId: 'r1', severity: 'medium', title: '待审 · Y',
    })
  })
  it('other statuses → null', () => {
    for (const s of ['triage', 'todo', 'running', 'ready', 'scheduled', 'done', 'archived'] as const) {
      expect(toAttention(t({ status: s }))).toBeNull()
    }
  })
})

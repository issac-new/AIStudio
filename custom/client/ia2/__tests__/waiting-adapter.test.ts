// overlay/custom/client/ia2/__tests__/waiting-adapter.test.ts
// v12 等我队列纯聚合守门：三源（review 任务 / awaiting-input 运行 / fleet 审批），
// 权重 task-review > run-approval > fleet-approval，同权按时间倒序。
import { describe, it, expect } from 'vitest'
import { buildWaiting } from '../adapters/waiting'

const NOW = Date.parse('2026-09-19T15:00:00Z')

function run(p: Record<string, unknown>) {
  return {
    runId: 'r-1', graphId: 'loop-l1', status: 'running', updatedAt: null,
    stage: null, iteration: 0, lastActivityAt: null, cost: 0, events: [],
    pendingInterruptId: null,
    ...p,
  }
}
function fleet(p: Record<string, unknown>) {
  return {
    id: 'fs-1', profile: 'p', title: 'fleet 会话', status: 'idle', isAborting: false,
    queueLength: 0, runStartedAt: null, lastActiveAt: NOW, source: '', agent: '',
    lastPreview: '', approvals: [], clarifies: [], subagents: [],
    ...p,
  }
}

describe('buildWaiting — 三源聚合与排序', () => {
  it('review 任务 → task-review（验收/打回动作位）', () => {
    const [out] = buildWaiting(
      [{ id: 't-402', title: 'v2.28 发布', status: 'review', assignee: 'worker-coder', createdAt: NOW - 3600e3 }],
      [], [], NOW,
    )
    expect(out).toMatchObject({ kind: 'task-review', id: 'task:t-402', taskId: 't-402', ts: NOW - 3600e3 })
  })
  it('awaiting-input 运行（有 pendingInterruptId）→ run-approval，携带 runId/interruptId', () => {
    const [out] = buildWaiting(
      [],
      [run({ runId: 'run-9', status: 'awaiting-input', pendingInterruptId: 'it-1', lastActivityAt: NOW - 60e3 })],
      [], NOW,
    )
    expect(out).toMatchObject({ kind: 'run-approval', runId: 'run-9', interruptId: 'it-1', ts: NOW - 60e3 })
  })
  it('awaiting-input 无 interruptId 不入队；非 review 任务不入队', () => {
    expect(buildWaiting(
      [{ id: 't-x', title: 'x', status: 'running', assignee: null, createdAt: NOW }],
      [run({ status: 'awaiting-input', pendingInterruptId: null })],
      [], NOW,
    )).toHaveLength(0)
  })
  it('fleet 审批逐条展开，携带 sessionId/approvalId', () => {
    const [out] = buildWaiting(
      [], [],
      [fleet({ id: 'fs-2', title: '复验确认', lastActiveAt: NOW - 30e3, approvals: [{ approval_id: 'ap-1', preview: '', choices: [] }] })],
      NOW,
    )
    expect(out).toMatchObject({ kind: 'fleet-approval', sessionId: 'fs-2', approvalId: 'ap-1' })
  })
  it('排序：task-review > run-approval > fleet-approval，同权 ts 倒序', () => {
    const out = buildWaiting(
      [{ id: 't-a', title: 'a', status: 'review', assignee: null, createdAt: NOW }],
      [run({ runId: 'r-old', status: 'awaiting-input', pendingInterruptId: 'i1', lastActivityAt: NOW - 9e6 })],
      [
        fleet({ id: 'f1', approvals: [{ approval_id: 'a1', preview: '', choices: [] }], lastActiveAt: NOW - 1 }),
        fleet({ id: 'f2', approvals: [{ approval_id: 'a2', preview: '', choices: [] }], lastActiveAt: NOW }),
      ],
      NOW,
    )
    expect(out.map(w => w.kind)).toEqual(['task-review', 'run-approval', 'fleet-approval', 'fleet-approval'])
    expect(out[2].approvalId).toBe('a2')
  })
})

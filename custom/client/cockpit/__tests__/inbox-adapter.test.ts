import { describe, it, expect } from 'vitest'
import { buildInboxItems, fleetAttentionToInbox, INBOX_KIND_WEIGHT } from '../adapters/inbox-adapter'
import type { FleetSession } from '../adapters/fleet-adapter'

function fleet(overrides: Partial<FleetSession>): FleetSession {
  return {
    id: 's1',
    profile: 'aiteam-orchestrator',
    title: '规划会话',
    status: 'working',
    isAborting: false,
    queueLength: 0,
    runStartedAt: null,
    lastActiveAt: 1000,
    source: 'cli',
    agent: '',
    lastPreview: '',
    approvals: [],
    clarifies: [],
    ...overrides,
  }
}

describe('buildInboxItems', () => {
  const sources = {
    attention: [
      { id: 'att-1', severity: 'high', title: '阻塞 · 任务A', taskId: 'T-1', createdAt: 500, priority: 1, status: 'blocked' },
      { id: 'att-2', severity: 'medium', title: '待审 · 任务B', taskId: 'T-2', createdAt: 900, priority: 2, status: 'review' },
    ] as any[],
    fleet: [
      fleet({ approvals: [{ approval_id: 'a1', preview: 'shell rm', choices: ['once'] }], clarifies: [{ clarify_id: 'c1', question: '继续?' }] }),
    ],
    chatUnreads: [
      { id: 'chat:s2', kind: 'chat', title: '侦察', preview: '完成', ts: 800, count: 3, routeTarget: { name: 'hermes.session', params: { sessionId: 's2' }, query: { profile: 'scout' } } },
    ] as any[],
    notifyItems: [
      { id: 'matrix:r1', kind: 'matrix', title: '房间', preview: 'hi', ts: 950, count: 1, routeTarget: { name: 'hermes.matrixChatRoom', params: { roomId: 'r1' } } },
      { id: 'reminder:t1:15', kind: 'reminder', title: '⏰ x', preview: '', ts: 990, count: 1, routeTarget: { name: 'hermes.cockpit' } },
    ] as any[],
  }

  it('ranks approval > blocked > clarify > review > chat > matrix > reminder', () => {
    const items = buildInboxItems(sources)
    expect(items.map(i => i.kind)).toEqual([
      'approval', 'blocked', 'clarify', 'review', 'chat', 'matrix', 'reminder',
    ])
  })

  it('carries actionable approval payload and deep links', () => {
    const items = buildInboxItems(sources)
    const approval = items.find(i => i.kind === 'approval')!
    expect(approval.approval).toMatchObject({ sessionId: 's1', approvalId: 'a1' })
    expect(approval.routeTarget).toMatchObject({ name: 'hermes.session', params: { sessionId: 's1' }, query: { profile: 'aiteam-orchestrator' } })
    const blocked = items.find(i => i.kind === 'blocked')!
    expect(blocked.taskId).toBe('T-1')
  })

  it('filters fleet/chat sources by team profiles while keeping matrix/reminder', () => {
    const items = buildInboxItems(sources, { profiles: ['scout'] })
    expect(items.some(i => i.kind === 'approval')).toBe(false)
    expect(items.some(i => i.kind === 'clarify')).toBe(false)
    expect(items.some(i => i.kind === 'chat')).toBe(true)   // scout 的会话未读保留
    expect(items.some(i => i.kind === 'matrix')).toBe(true)
    expect(items.some(i => i.kind === 'reminder')).toBe(true)
  })

  it('same weight sorts by ts desc', () => {
    const items = buildInboxItems({
      attention: [],
      fleet: [],
      chatUnreads: [
        { id: 'a', kind: 'chat', title: '旧', preview: '', ts: 100, count: 1, routeTarget: {} },
        { id: 'b', kind: 'chat', title: '新', preview: '', ts: 900, count: 1, routeTarget: {} },
      ],
      notifyItems: [],
    })
    expect(items.map(i => i.title)).toEqual(['新', '旧'])
  })
})

describe('fleetAttentionToInbox', () => {
  it('produces one item per approval and clarify', () => {
    const items = fleetAttentionToInbox([fleet({ approvals: [{ approval_id: 'x', preview: '', choices: [] }, { approval_id: 'y', preview: '', choices: [] }], clarifies: [{ clarify_id: 'z', question: 'q' }] })])
    expect(items).toHaveLength(3)
    expect(items.every(i => i.severity === 'high')).toBe(true)
  })
})

describe('INBOX_KIND_WEIGHT', () => {
  it('keeps decision-critical kinds on top', () => {
    expect(INBOX_KIND_WEIGHT.approval).toBeLessThan(INBOX_KIND_WEIGHT.blocked)
    expect(INBOX_KIND_WEIGHT.blocked).toBeLessThan(INBOX_KIND_WEIGHT.review)
    expect(INBOX_KIND_WEIGHT.review).toBeLessThan(INBOX_KIND_WEIGHT.chat)
  })
})

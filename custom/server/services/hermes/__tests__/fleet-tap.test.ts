import { describe, it, expect } from 'vitest'
import {
  extractPendingInteractions,
  extractLastPreview,
  getFleetLiveEntries,
  registerChatRunSocket,
  unregisterChatRunSocket,
  buildFleetSnapshotFromTap,
  isFleetTapReady,
} from '../fleet-tap'
import { buildFleetSnapshot } from '../fleet-snapshot'

describe('extractPendingInteractions', () => {
  it('keeps unresolved approvals/clarifies and drops resolved ones', () => {
    const events = [
      { event: 'approval.requested', data: { approval_id: 'a1', tool: 'terminal', choices: ['once', 'deny'] } },
      { event: 'approval.requested', data: { approval_id: 'a2', preview: 'rm -rf /tmp/x' } },
      { event: 'approval.resolved', data: { approval_id: 'a1' } },
      { event: 'clarify.requested', data: { clarify_id: 'c1', question: '用哪个分支？' } },
      { event: 'clarify.resolved', data: { clarify_id: 'c1' } },
    ]
    const pending = extractPendingInteractions(events)
    expect(pending.approvals).toHaveLength(1)
    expect(pending.approvals[0]).toMatchObject({ approval_id: 'a2', preview: 'rm -rf /tmp/x' })
    expect(pending.approvals[0].choices).toEqual(['once', 'session', 'deny'])
    expect(pending.clarifies).toHaveLength(0)
  })

  it('ignores malformed payloads', () => {
    const pending = extractPendingInteractions([
      { event: 'approval.requested', data: {} },
      { event: 'other.event', data: { approval_id: 'x' } },
    ])
    expect(pending.approvals).toHaveLength(0)
  })
})

describe('extractLastPreview', () => {
  it('prefers the last assistant text message', () => {
    const preview = extractLastPreview([
      { role: 'user', content: '跑一下测试' },
      { role: 'assistant', content: '开始执行…' },
      { role: 'assistant', content: [{ type: 'text', text: '3 个用例全部通过' }] },
    ])
    expect(preview).toBe('3 个用例全部通过')
  })

  it('clips to 200 chars and returns empty on nothing readable', () => {
    expect(extractLastPreview([{ role: 'assistant', content: 'x'.repeat(500) }])).toHaveLength(200)
    expect(extractLastPreview(undefined)).toBe('')
  })
})

describe('fleet tap registration', () => {
  it('reads live entries from a fake ChatRunSocket instance', () => {
    registerChatRunSocket(
      {
        sessionMap: new Map([
          ['s1', {
            isWorking: true,
            isAborting: false,
            queue: [{}, {}],
            runStartedAt: 1234,
            profile: 'aiteam-orchestrator',
            source: 'cli',
            events: [{ event: 'approval.requested', data: { approval_id: 'a1', tool: 'shell' } }],
            messages: [{ role: 'assistant', content: '规划中' }],
          }],
          ['s2', { isWorking: false, queue: [], events: [], messages: [] }],
        ]),
      },
      { getSession: () => null, listSessions: () => [] },
    )
    expect(isFleetTapReady()).toBe(true)
    const entries = getFleetLiveEntries()
    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatchObject({
      id: 's1',
      profile: 'aiteam-orchestrator',
      isWorking: true,
      queueLength: 2,
      runStartedAt: 1234,
      lastPreview: '规划中',
    })
    expect(entries[0].approvals).toEqual([{ approval_id: 'a1', preview: 'shell', choices: ['once', 'session', 'deny'] }])
    unregisterChatRunSocket()
    expect(isFleetTapReady()).toBe(false)
    expect(getFleetLiveEntries()).toEqual([])
  })

  it('full snapshot merges db rows with live overrides', () => {
    registerChatRunSocket(
      {
        sessionMap: new Map([
          ['live-1', { isWorking: true, profile: 'scout', source: 'cli', queue: [], events: [], messages: [] }],
        ]),
      },
      {
        getSession: () => null,
        listSessions: () => [
          { id: 'live-1', profile: 'scout', title: '侦察任务', last_active: Math.floor(Date.now() / 1000), source: 'cli', agent: 'hermes' },
          { id: 'idle-1', profile: 'training', title: '训练旧会话', last_active: Math.floor(Date.now() / 1000) - 7200, source: 'cli', agent: null },
          { id: 'ancient', profile: 'training', title: '三天前', last_active: Math.floor(Date.now() / 1000) - 3 * 86400, source: 'cli', agent: null },
        ],
      },
    )
    const snapshot = buildFleetSnapshotFromTap()
    const ids = snapshot.map(s => s.id)
    expect(ids).toContain('live-1')
    expect(ids).toContain('idle-1')
    expect(ids).not.toContain('ancient')
    const live = snapshot.find(s => s.id === 'live-1')!
    expect(live.status).toBe('working')
    expect(live.title).toBe('侦察任务')
    expect(snapshot[0].id).toBe('live-1') // working 优先排序
    unregisterChatRunSocket()
  })
})

describe('buildFleetSnapshot (pure)', () => {
  it('keeps working sessions even beyond the limit', () => {
    const now = Date.now()
    const db = Array.from({ length: 5 }, (_, i) => ({
      id: `db-${i}`,
      profile: 'default',
      title: `db-${i}`,
      last_active: Math.floor(now / 1000),
      source: 'cli',
      agent: null,
    }))
    const snapshot = buildFleetSnapshot({
      live: [{ id: 'live-x', profile: 'p', isWorking: true, isAborting: false, queueLength: 0, runStartedAt: null, source: '', lastPreview: '', approvals: [], clarifies: [] }],
      dbSessions: db,
      now,
      limit: 3,
    })
    expect(snapshot.some(s => s.id === 'live-x')).toBe(true)
  })
})

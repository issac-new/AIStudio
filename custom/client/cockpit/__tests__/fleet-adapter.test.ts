// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { normalizeSnapshot } from '../adapters/fleet-adapter'

describe('normalizeSnapshot', () => {
  it('normalizes a healthy server snapshot', () => {
    const snapshot = normalizeSnapshot({
      ts: 123456,
      sessions: [{
        id: 's1',
        profile: 'aiteam-orchestrator',
        title: '规划',
        status: 'working',
        isAborting: false,
        queueLength: 2,
        runStartedAt: 123000,
        lastActiveAt: 123400,
        source: 'cli',
        agent: 'hermes',
        lastPreview: '正在分解任务…',
        approvals: [{ approval_id: 'a1', preview: 'shell', choices: ['once', 'deny'] }],
        clarifies: [],
      }],
    })
    expect(snapshot.ts).toBe(123456)
    expect(snapshot.sessions).toHaveLength(1)
    expect(snapshot.sessions[0]).toMatchObject({
      id: 's1',
      status: 'working',
      queueLength: 2,
      runStartedAt: 123000,
    })
    expect(snapshot.sessions[0].approvals[0].choices).toEqual(['once', 'deny'])
  })

  it('drops malformed entries and defaults missing fields', () => {
    const snapshot = normalizeSnapshot({
      sessions: [
        null,
        { id: 'ok' },
        { noId: true },
        { id: 'w', status: 'weird', approvals: [null, { approval_id: 'g' }], clarifies: [{ clarify_id: 'c', question: 42 }] },
      ],
    })
    const ids = snapshot.sessions.map(s => s.id)
    expect(ids).toEqual(['ok', 'w'])
    const w = snapshot.sessions.find(s => s.id === 'w')!
    expect(w.status).toBe('idle')
    expect(w.title).toBe('w')
    expect(w.approvals).toEqual([{ approval_id: 'g', preview: '', choices: [] }])
    expect(w.clarifies).toEqual([{ clarify_id: 'c', question: '' }])
  })

  it('returns empty on garbage payloads', () => {
    expect(normalizeSnapshot(null).sessions).toEqual([])
    expect(normalizeSnapshot('nope').sessions).toEqual([])
    expect(normalizeSnapshot({ sessions: 'not-array' }).sessions).toEqual([])
  })
})

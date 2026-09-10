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

describe('normalizeSnapshot subagents（0.21.1 delegation 花名册）', () => {
  it('normalizes roster entries, running first, seconds timestamps to ms', () => {
    const snapshot = normalizeSnapshot({
      sessions: [{
        id: 's1',
        profile: 'p',
        title: '委派会话',
        status: 'idle',
        subagents: [
          {
            subagent_id: 'sa-done',
            goal: '收尾整理',
            status: 'completed',
            model: 'gpt-6',
            duration_seconds: 12.4,
            cost_usd: 0.021,
            input_tokens: 900,
            output_tokens: 300,
            updated_at: 1757400000,
            started_at: 1757399980,
          },
          {
            subagent_id: 'sa-run',
            goal: '调研上游变更',
            status: 'running',
            tool_count: 7,
            last_tool: 'web_search',
            updated_at: 1757400100,
          },
          { goal: '缺 subagent_id，应被丢弃' },
          null,
        ],
      }],
    })
    const subs = snapshot.sessions[0].subagents
    expect(subs).toHaveLength(2)
    expect(subs[0]).toMatchObject({ subagent_id: 'sa-run', status: 'running', tool_count: 7, last_tool: 'web_search' })
    expect(subs[0].updated_at).toBe(1757400100 * 1000)
    expect(subs[0].started_at).toBeNull()
    expect(subs[1]).toMatchObject({ subagent_id: 'sa-done', status: 'completed', duration_seconds: 12.4, cost_usd: 0.021 })
    expect(subs[1].started_at).toBe(1757399980 * 1000)
  })

  it('defaults to empty roster and clips overlong goals', () => {
    const snapshot = normalizeSnapshot({
      sessions: [
        { id: 's-no-subs', profile: 'p', title: 't' },
        { id: 's-clip', profile: 'p', title: 't', subagents: [{ subagent_id: 'x', goal: '长'.repeat(300) }] },
      ],
    })
    expect(snapshot.sessions[0].subagents).toEqual([])
    expect(snapshot.sessions[1].subagents[0].goal.length).toBeLessThanOrEqual(161)
  })
})

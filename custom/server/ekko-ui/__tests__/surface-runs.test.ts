// @vitest-environment node
// overlay/custom/server/ekko-ui/__tests__/surface-runs.test.ts
// 服务端宿主守门：阻塞/提交/取消/超时/单挂起/revision/危险键。
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SurfaceRuns } from '../surface-runs'
import { SurfaceError, surfaceIdFor, SURFACE_PROTOCOL } from '../contract'

function spec(overrides: Record<string, unknown> = {}) {
  return {
    protocol: SURFACE_PROTOCOL,
    surfaceId: 'booking',
    title: '预订',
    fallbackText: '预订表单',
    state: { date: '' },
    root: { id: 'root', type: 'form', children: [] },
    ...overrides,
  }
}

function harness() {
  const events: Array<{ sessionId: string; event: string; payload: Record<string, unknown> }> = []
  const runs = new SurfaceRuns((sessionId, event, payload) => events.push({ sessionId, event, payload }))
  runs.begin('ctx-1', 's1', 'default', () => ({ isWorking: true, activeRunMarker: 'run-1' }))
  return { runs, events }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('SurfaceRuns', () => {
  it('present → submit：发布 presented/closed 并返回结构化 payload', async () => {
    const { runs, events } = harness()
    const pending = runs.request('ctx-1', 'default', { spec: spec(), timeout_ms: 5000 })
    await Promise.resolve()
    expect(events[0].event).toBe('ui.surface.presented')
    expect(events[0].payload.surface_id).toBe(surfaceIdFor('s1', 'booking'))
    expect(events[0].payload.revision).toBe(1)

    const result = runs.respond('s1', surfaceIdFor('s1', 'booking'), 1, 'submit', { date: '2026-11-20' })
    expect(result).toEqual({ handled: true, resolved: true })
    await expect(pending).resolves.toEqual({
      status: 'submitted',
      surface_id: surfaceIdFor('s1', 'booking'),
      revision: 1,
      action_id: 'submit',
      payload: { date: '2026-11-20' },
    })
    expect(events.map(item => item.event)).toEqual(['ui.surface.presented', 'ui.surface.closed'])
    expect(events[1].payload.status).toBe('submitted')
    expect(runs.hasPending('s1')).toBe(false)
  })

  it('cancel：返回 cancelled 且不需要 payload', async () => {
    const { runs } = harness()
    const pending = runs.request('ctx-1', 'default', { spec: spec() })
    await Promise.resolve()
    runs.respond('s1', surfaceIdFor('s1', 'booking'), 1, 'cancel', undefined)
    await expect(pending).resolves.toMatchObject({ status: 'cancelled', action_id: 'cancel' })
  })

  it('超时：返回 expired，reason=timed_out', async () => {
    vi.useFakeTimers()
    const { runs, events } = harness()
    const pending = runs.request('ctx-1', 'default', { spec: spec(), timeout_ms: 1000 })
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(1000)
    await expect(pending).resolves.toMatchObject({ status: 'expired', reason: 'timed_out' })
    expect(events.at(-1)?.payload.status).toBe('expired')
  })

  it('同一会话只允许一个挂起界面', async () => {
    const { runs } = harness()
    const first = runs.request('ctx-1', 'default', { spec: spec() })
    await Promise.resolve()
    expect(() => runs.request('ctx-1', 'default', { spec: spec({ surfaceId: 'second' }) }))
      .toThrowError(/already pending/i)
    runs.respond('s1', surfaceIdFor('s1', 'booking'), 1, 'cancel', undefined)
    await first
  })

  it('revision 不匹配拒绝（409）', async () => {
    const { runs } = harness()
    const pending = runs.request('ctx-1', 'default', { spec: spec() })
    await Promise.resolve()
    expect(() => runs.respond('s1', surfaceIdFor('s1', 'booking'), 2, 'submit', { a: 1 }))
      .toThrowError(SurfaceError)
    runs.respond('s1', surfaceIdFor('s1', 'booking'), 1, 'cancel', undefined)
    await pending
  })

  it('会话不匹配不处理，跨会话回填被忽略', async () => {
    const { runs } = harness()
    const pending = runs.request('ctx-1', 'default', { spec: spec() })
    await Promise.resolve()
    expect(runs.respond('s2', surfaceIdFor('s1', 'booking'), 1, 'submit', { a: 1 }))
      .toEqual({ handled: true, resolved: false })
    runs.respond('s1', surfaceIdFor('s1', 'booking'), 1, 'cancel', undefined)
    await pending
  })

  it('运行结束取消挂起界面', async () => {
    const { runs } = harness()
    const pending = runs.request('ctx-1', 'default', { spec: spec() })
    await Promise.resolve()
    runs.finishSession('s1')
    await expect(pending).resolves.toMatchObject({ status: 'cancelled', reason: 'run-ended' })
  })

  it('拒绝危险键与超大 spec', async () => {
    const { runs } = harness()
    await expect(async () => {
      runs.request('ctx-1', 'default', {
        spec: { ...spec(), state: JSON.parse('{"__proto__":{"polluted":true}}') },
      })
    }).rejects.toThrowError(/forbidden key/i)
    await expect(async () => {
      runs.request('ctx-1', 'default', {
        spec: spec({ root: { id: 'root', type: 'text', props: { text: 'x'.repeat(6000) } } }),
      })
    }).rejects.toThrowError(/string exceeds/i)
  })

  it('非活跃 turn 拒绝请求（409）', async () => {
    const runs = new SurfaceRuns(() => {})
    runs.begin('ctx-2', 's2', 'default', () => ({ isWorking: false }))
    expect(() => runs.request('ctx-2', 'default', { spec: spec() })).toThrowError(/no active turn/i)
  })
})

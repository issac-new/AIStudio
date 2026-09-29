// @vitest-environment jsdom
// 跨机派发聚合守门（客户端口径）：deriveDispatchStats 与服务端台账聚合语义一致
// （都按 created/running 计送达、failed 计失败、done/waiting-human 不计成败）；
// 不与服务端重复，但同口径断言防两端漂移。
import { describe, it, expect, beforeEach } from 'vitest'
import { deriveDispatchStats, loadDispatchStats, saveDispatchIndex, DISPATCH_INDEX_KEY } from '../store/dispatch-kv'

describe('跨机派发聚合（客户端 kv 口径）', () => {
  beforeEach(() => { localStorage.clear() })

  it('五态分桶+成功率口径+零样本 null', () => {
    const s = deriveDispatchStats({
      a: { localTaskId: 'k1', lastStatus: 'created', lastSyncedAt: 1 },
      b: { localTaskId: 'k2', lastStatus: 'running', lastSyncedAt: 1 },
      c: { localTaskId: 'k3', lastStatus: 'waiting-human', lastSyncedAt: 1 },
      d: { localTaskId: 'k4', lastStatus: 'done', lastSyncedAt: 1 },
      e: { localTaskId: 'k5', lastStatus: 'failed', lastSyncedAt: 1 },
    })
    expect(s.total).toBe(5)
    expect(s.created + s.running).toBe(2)
    expect(s.failed).toBe(1)
    expect(s.deliveredRate).toBeCloseTo(2 / 3, 5)
    expect(deriveDispatchStats({}).deliveredRate).toBeNull()
  })

  it('loadDispatchStats 从 localStorage 实读；坏 JSON 回零态', () => {
    saveDispatchIndex({ x: { localTaskId: 'kx', lastStatus: 'running', lastSyncedAt: 1 } })
    expect(loadDispatchStats().total).toBe(1)
    expect(loadDispatchStats().running).toBe(1)
    localStorage.setItem(DISPATCH_INDEX_KEY, 'not-json')
    expect(loadDispatchStats().total).toBe(0)
  })
})

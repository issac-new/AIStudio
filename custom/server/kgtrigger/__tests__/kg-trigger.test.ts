// A1 守门（KG 演化治理 2026-10-02）：攒批两边界（含等于）、节流、状态持久化、
// 首见建基线不误判、消失板清理、markSyncSuccess。纯函数直驱 + tmpdir 状态文件。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  shouldTrigger, advanceTick, markSyncSuccess, emptyTriggerState,
  readTriggerState, writeTriggerState,
} from '../kg-trigger'

describe('shouldTrigger：攒批两边界（含等于）', () => {
  it('pendingCount=0 恒不触发；攒够 batchSize（含等于）即触发', () => {
    expect(shouldTrigger({ pendingCount: 0, oldestPendingAgeMs: 999_999 })).toBe(false)
    expect(shouldTrigger({ pendingCount: 3, oldestPendingAgeMs: 0, batchSize: 3 })).toBe(true)   // 恰好=阈值 → 触发
    expect(shouldTrigger({ pendingCount: 2, oldestPendingAgeMs: 29_999, batchSize: 3 })).toBe(false)
  })

  it('窗口边界：最早项等够 30s（含等于）触发；差 1ms 不触发', () => {
    expect(shouldTrigger({ pendingCount: 1, oldestPendingAgeMs: 30_000 })).toBe(true)
    expect(shouldTrigger({ pendingCount: 1, oldestPendingAgeMs: 29_999 })).toBe(false)
    // 攒批优先：已够 N 条时窗口未满也触发
    expect(shouldTrigger({ pendingCount: 5, oldestPendingAgeMs: 1, batchSize: 3 })).toBe(true)
  })
})

describe('advanceTick：状态机推进', () => {
  const obs = (slug: string, mtimeMs: number, count = 1) => ({ slug, mtimeMs, count })

  it('首次观察只建基线不进 pending（进程重启不误判既有板）', () => {
    const r = advanceTick(emptyTriggerState(), [obs('b1', 1000, 7)], 10_000)
    expect(r.state.baselines).toEqual({ b1: 1000 })
    expect(r.state.pending).toEqual({})
    expect(r.triggered).toBe(false)
    expect(r.reason).toBe('idle')
  })

  it('mtime 变化进 pending；未攒够且窗口未满=idle；攒够 3 板=batch 触发', () => {
    let st = advanceTick(emptyTriggerState(), [obs('b1', 1000), obs('b2', 2000), obs('b3', 3000)], 10_000).state
    st = advanceTick(st, [obs('b1', 1500), obs('b2', 2500), obs('b3', 3000)], 20_000).state  // 两板变化
    expect(Object.keys(st.pending).sort()).toEqual(['b1', 'b2'])
    // 观察不变（mtime 未再变）：5s 后 2<3 且最早等了 5s<30s → idle
    const r2 = advanceTick(st, [obs('b1', 1500), obs('b2', 2500), obs('b3', 3000)], 25_000)
    expect(r2.triggered).toBe(false)
    const r3 = advanceTick(st, [obs('b1', 1500), obs('b2', 2500), obs('b3', 3500)], 26_000)  // 第三板变化 → 攒够
    expect(r3.triggered).toBe(true)
    expect(r3.reason).toBe('batch')
    expect(r3.state.pending.b1.firstSeenAt).toBe(20_000)  // 窗口起算不因后续观察重置
  })

  it('窗口触发：单板等够 30s（含等于）→ window', () => {
    let st = advanceTick(emptyTriggerState(), [obs('b1', 1000)], 10_000).state
    st = advanceTick(st, [obs('b1', 1100)], 15_000).state
    const at = advanceTick(st, [obs('b1', 1100)], 45_000)  // 等了恰 30s
    expect(at.triggered).toBe(true)
    expect(at.reason).toBe('window')
  })

  it('节流：上次成功后 <5min 满足条件也不触发（pending 保留）；满 5min 触发；从未成功不节流', () => {
    // 从未成功（lastSuccessAt=0）：攒够即触发，不被节流拦
    const neverSynced = advanceTick(emptyTriggerState(), [obs('b1', 1000), obs('b2', 2000)], 10_000).state
    const cold = advanceTick(neverSynced, [obs('b1', 1500), obs('b2', 2500)], 11_000)
    expect(cold.triggered).toBe(false)  // 2<3 且窗口未满
    expect(cold.reason).toBe('idle')

    // 上次成功于 30_000：成功后三板变化 → 条件满足但节流内拦下
    let st: ReturnType<typeof emptyTriggerState> = { baselines: { b1: 1000, b2: 2000, b3: 3000 }, pending: {}, lastSuccessAt: 30_000 }
    const wave = [obs('b1', 1500), obs('b2', 2500), obs('b3', 3500)]
    st = advanceTick(st, wave, 60_000).state
    expect(Object.keys(st.pending)).toHaveLength(3)
    const throttled = advanceTick(st, wave, 60_000 + 4 * 60 * 1000)  // +4min：条件满足但节流内
    expect(throttled.triggered).toBe(false)
    expect(throttled.reason).toBe('throttled')
    expect(Object.keys(throttled.state.pending)).toHaveLength(3)  // pending 保留
    const ready = advanceTick(throttled.state, wave, 30_000 + 5 * 60 * 1000)  // 距成功恰满 5min（含等于可触发）
    expect(ready.triggered).toBe(true)
  })

  it('markSyncSuccess 清 pending 记时间；消失板从 pending 与基线清理', () => {
    let st = advanceTick(emptyTriggerState(), [obs('b1', 1000), obs('gone', 500)], 10_000).state
    st = advanceTick(st, [obs('b1', 2000), obs('gone', 600)], 20_000).state
    expect(st.pending).toHaveProperty('gone')
    const after = advanceTick(st, [obs('b1', 2000)], 30_000).state  // gone 板消失
    expect(after.pending).not.toHaveProperty('gone')
    expect(after.baselines).not.toHaveProperty('gone')
    const ok = markSyncSuccess(after, 40_000)
    expect(ok.pending).toEqual({})
    expect(ok.lastSuccessAt).toBe(40_000)
    expect(ok.baselines).toHaveProperty('b1')  // 基线保留（成功即已消化该 mtime）
  })
})

describe('状态持久化（tmp+rename；fail-soft）', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'kgtrig-'))
    process.env.KG_TRIGGER_STATE = join(dir, 'state.json')
  })
  afterEach(() => {
    delete process.env.KG_TRIGGER_STATE
    rmSync(dir, { recursive: true, force: true })
  })

  it('写读回环；文件缺席/损坏 → 空态', async () => {
    const { triggerStateExists } = await import('../kg-trigger')
    expect(readTriggerState()).toEqual(emptyTriggerState())
    expect(triggerStateExists()).toBe(false)
    writeTriggerState({
      baselines: { b1: 111 },
      pending: { b1: { mtimeMs: 222, firstSeenAt: 333, count: 4 } },
      lastSuccessAt: 444,
    })
    expect(triggerStateExists()).toBe(true)
    expect(readTriggerState()).toEqual({
      baselines: { b1: 111 },
      pending: { b1: { mtimeMs: 222, firstSeenAt: 333, count: 4 } },
      lastSuccessAt: 444,
    })
    writeFileSync(join(dir, 'state.json'), '{not-json')
    expect(readTriggerState()).toEqual(emptyTriggerState())  // 坏文件 fail-soft 空态
  })
})

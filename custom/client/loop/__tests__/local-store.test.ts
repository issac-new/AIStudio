// overlay/custom/client/loop/__tests__/local-store.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { LocalStore } from '../../../server/loop/store/local-store'
import { promises as fs } from 'fs'
import { existsSync } from 'fs'
import { resolve } from 'path'
import type { LoopInstance, LoopEvent } from '../types'

const TEST_DIR = '.loop-test'

function makeLoop(id: string = 'test-loop'): LoopInstance {
  return {
    id, name: 'Test Loop', goal: 'test goal', stopCondition: 'all tests pass',
    pattern: 'daily-triage', schedule: { mode: 'cron', cron: '0 9 * * *', timezone: 'UTC' },
    stage: 'discovery', status: 'idle', autonomyLevel: 'L1', stateAdapter: 'local',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    lastTickAt: null, nextTickAt: null,
    budget: { maxCostPerTick: 50, maxCostTotal: 200, killMode: 'throw', warningThreshold: 0.8 },
    stats: { totalIterations: 0, tasksDiscovered: 0, tasksCompleted: 0, tasksBlocked: 0, totalCost: 0, currentIteration: 0 },
  }
}

describe('LocalStore', () => {
  let store: LocalStore

  beforeEach(() => {
    store = new LocalStore(TEST_DIR)
  })

  afterEach(async () => {
    if (existsSync(TEST_DIR)) {
      await fs.rm(TEST_DIR, { recursive: true, force: true })
    }
  })

  it('creates and retrieves a loop', async () => {
    const loop = makeLoop()
    await store.createLoop(loop)
    const retrieved = await store.getLoop('test-loop')
    expect(retrieved).not.toBeNull()
    expect(retrieved!.name).toBe('Test Loop')
  })

  it('updates a loop', async () => {
    await store.createLoop(makeLoop())
    await store.updateLoop('test-loop', { status: 'running', stage: 'handoff' })
    const updated = await store.getLoop('test-loop')
    expect(updated!.status).toBe('running')
    expect(updated!.stage).toBe('handoff')
  })

  it('lists loops with filter', async () => {
    await store.createLoop(makeLoop('loop-a'))
    const lb = makeLoop('loop-b')
    lb.status = 'running'
    await store.createLoop(lb)
    const all = await store.listLoops()
    expect(all.length).toBe(2)
    const running = await store.listLoops({ status: ['running'] })
    expect(running.length).toBe(1)
    expect(running[0].id).toBe('loop-b')
  })

  it('deletes a loop', async () => {
    await store.createLoop(makeLoop())
    await store.deleteLoop('test-loop')
    const retrieved = await store.getLoop('test-loop')
    expect(retrieved).toBeNull()
  })

  it('appends and queries events', async () => {
    await store.createLoop(makeLoop())
    const event: LoopEvent = {
      type: 'loop.stage-transition', loopId: 'test-loop',
      from: 'discovery', to: 'handoff', reason: 'tasks found', ts: new Date().toISOString(),
    }
    await store.appendEvent(event)
    const events = await store.queryEvents('test-loop')
    expect(events.length).toBe(1)
    expect(events[0].type).toBe('loop.stage-transition')
  })

  // P3 台账（T4/T7 合并，顺延 P4 清偿）：钉死 queryEvents 的窗口语义契约——
  // limit 截断取"最新 N 条、升序返回"（slice(-limit)）。saas-store 已对齐（见
  // saas-store.test.ts 同名组）；消费方（stuck 检测 1/20 条、loop socket 回放 50 条、
  // 前端 getEvents 500 条）都以"最近事件"为窗口意图。
  it('queryEvents limit takes the NEWEST N events and returns them ascending (P3 台账：窗口语义契约)', async () => {
    await store.createLoop(makeLoop())
    for (let i = 1; i <= 5; i++) {
      await store.appendEvent({
        type: 'loop.stage-transition', loopId: 'test-loop',
        from: 'discovery', to: 'handoff', reason: `e${i}`,
        ts: new Date(Date.UTC(2026, 8, 10, 0, 0, i)).toISOString(),
      } as LoopEvent)
    }
    // 全量升序
    const all = await store.queryEvents('test-loop')
    expect(all.map(e => (e as { reason: string }).reason)).toEqual(['e1', 'e2', 'e3', 'e4', 'e5'])
    // limit 3 → 最新 3 条（e3/e4/e5），仍按时间升序返回
    const newest3 = await store.queryEvents('test-loop', undefined, 3)
    expect(newest3.map(e => (e as { reason: string }).reason)).toEqual(['e3', 'e4', 'e5'])
    // limit 1 → 最新 1 条（stuck-detector 的取法）
    const newest1 = await store.queryEvents('test-loop', undefined, 1)
    expect(newest1.map(e => (e as { reason: string }).reason)).toEqual(['e5'])
  })

  it('regenerates STATE.md after create', async () => {
    await store.createLoop(makeLoop())
    const mdPath = resolve(TEST_DIR, 'STATE.md')
    expect(existsSync(mdPath)).toBe(true)
    const md = await fs.readFile(mdPath, 'utf-8')
    expect(md).toContain('# Loop State Spine')
    expect(md).toContain('### test-loop')
    expect(md).toContain('Test Loop')
  })

  it('detects drift returns false when state is consistent', async () => {
    await store.createLoop(makeLoop())
    const report = await store.detectDrift('test-loop')
    expect(report.hasDrift).toBe(false)
  })
})

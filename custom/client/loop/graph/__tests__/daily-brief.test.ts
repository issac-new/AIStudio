// P2 Task 8 — R1 每日 Brief：三段式结构化汇总（进展/等你决策/今日计划）+ Matrix 投递
// 零 LLM 依赖：聚合纯事件日志 + loop 台账；renderBrief 纯函数；
// 触发判定 = cron 最近触发点落今日 + 事件日志水位（graphId='daily-brief'）——重启不重发。
// fake clock 全程注入（clock: () => now），不 sleep 等真实时间。
import { describe, it, expect, vi } from 'vitest'
import {
  BRIEF_GRAPH_ID,
  DailyBriefJob,
  aggregateIsEmpty,
  collectAggregate,
  readBriefConfig,
  renderBrief,
} from '../../../../server/loop/graph/daily-brief'
import { InMemoryEventLogStore } from '../../../../server/loop/graph/event-log-store'
import type { LoopInstance, LoopEvent } from '../../../../server/loop/types'
import type { LoopStateStore } from '../../../../server/loop/store/state-store'

const HOUR = 3_600_000
/** 本地时区构造（cron 与 dateKey 均按本地时区语义，同源构造避免 TZ 漂移） */
const at = (y: number, m: number, d: number, h: number, min: number): number =>
  new Date(y, m - 1, d, h, min, 0, 0).getTime()
/** 基准：2026-09-10 09:00 本地（默认 cron 0 9 * * * 的今日触发点） */
const T0 = at(2026, 9, 10, 9, 0)

function makeLoop(over: Partial<LoopInstance> = {}): LoopInstance {
  return {
    id: 'loop-1', name: 'L', goal: 'g', stopCondition: '', pattern: 'daily-triage',
    schedule: { mode: 'manual', timezone: 'UTC' }, stage: 'scheduling', status: 'idle',
    autonomyLevel: 'L1', stateAdapter: 'local', createdAt: '', updatedAt: '',
    lastTickAt: null, nextTickAt: null,
    budget: { maxCostPerTick: 1, maxCostTotal: 10, killMode: 'notify', warningThreshold: 0.8 },
    stats: { totalIterations: 0, tasksDiscovered: 0, tasksCompleted: 0, tasksBlocked: 0, totalCost: 0, currentIteration: 0 },
    ...over,
  }
}

interface FakeStoreOpts {
  loops?: LoopInstance[]
  eventsByLoop?: Record<string, LoopEvent[]>
}

function makeStore(opts: FakeStoreOpts = {}): LoopStateStore {
  const loops = opts.loops ?? []
  const eventsByLoop = opts.eventsByLoop ?? {}
  return {
    createLoop: async () => {},
    getLoop: async id => loops.find(l => l.id === id) ?? null,
    listLoops: async () => [...loops],
    updateLoop: async () => {},
    deleteLoop: async () => {},
    appendContract: async () => {},
    getContract: async () => null,
    queryContracts: async () => [],
    updateContract: async () => {},
    appendVerification: async () => {},
    appendEvent: async () => {},
    queryEvents: async (loopId, since) => {
      const list = eventsByLoop[loopId] ?? []
      return since ? list.filter(e => e.ts > since) : [...list]
    },
    detectDrift: async () => ({ hasDrift: false, details: '' }),
  }
}

interface JobHarness {
  eventLog: InMemoryEventLogStore
  store: LoopStateStore
  clock: { now: number }
  deliver: ReturnType<typeof vi.fn>
  job: DailyBriefJob
}

function makeJob(over: Partial<ConstructorParameters<typeof DailyBriefJob>[0]> = {}): JobHarness {
  const eventLog = new InMemoryEventLogStore()
  const store = over.store ?? makeStore()
  const clock = { now: T0 }
  const deliver = vi.fn(async () => {})
  const job = new DailyBriefJob({
    eventLog, store,
    clock: () => clock.now,
    deliver: over.deliver === null ? undefined : (over.deliver ?? deliver),
    log: () => {},
    ...over,
    // over 展开在后可覆盖 eventLog/store/deliver；deliver:null 显式表示"未注入投递通道"
    ...(over.deliver === null ? { deliver: undefined } : {}),
  })
  return { eventLog, store, clock, deliver, job }
}

/** 直落事件日志的 run（不经图引擎——聚合读的是日志事实） */
async function seedRun(
  eventLog: InMemoryEventLogStore,
  opts: {
    runId: string
    graphId: string
    startedAtMs: number
    completedAtMs?: number
    failedAtMs?: number
    error?: string
    interrupt?: { id: string; raisedAtMs: number }
    resumedInterruptIds?: string[]
  },
): Promise<void> {
  await eventLog.append({ runId: opts.runId, graphId: opts.graphId, ts: opts.startedAtMs, kind: 'run.started', payload: {} })
  if (opts.interrupt) {
    await eventLog.append({
      runId: opts.runId, graphId: opts.graphId, ts: opts.interrupt.raisedAtMs,
      kind: 'interrupt.raised', payload: { interruptId: opts.interrupt.id, value: { kind: 'approval' } },
    })
    await eventLog.saveCheckpoint({
      id: `cp-${opts.runId}`, runId: opts.runId, graphId: opts.graphId, superStep: 1,
      state: {}, nextNodes: [], iterCounters: {}, totalCost: 0,
      startedAtMs: opts.startedAtMs, createdAt: new Date(opts.startedAtMs).toISOString(),
      pendingInterrupts: [{
        nodeId: 'gate', value: { kind: 'approval' }, id: opts.interrupt.id,
        raisedAtMs: opts.interrupt.raisedAtMs,
      }],
    })
    for (const id of opts.resumedInterruptIds ?? []) {
      await eventLog.append({
        runId: opts.runId, graphId: opts.graphId, ts: opts.interrupt.raisedAtMs + 1,
        kind: 'interrupt.resumed', payload: { interruptId: id },
      })
    }
  }
  if (opts.completedAtMs !== undefined) {
    await eventLog.append({
      runId: opts.runId, graphId: opts.graphId, ts: opts.completedAtMs,
      kind: 'run.completed', payload: { totalCost: 0.1 },
    })
  }
  if (opts.failedAtMs !== undefined) {
    await eventLog.append({
      runId: opts.runId, graphId: opts.graphId, ts: opts.failedAtMs,
      kind: 'run.failed', payload: { error: opts.error ?? 'boom' },
    })
  }
}

const briefRuns = async (eventLog: InMemoryEventLogStore) =>
  (await eventLog.listRuns()).filter(r => r.graphId === BRIEF_GRAPH_ID)

// -----------------------------------------------------------------------------

describe('renderBrief（纯函数，三段式）', () => {
  const fullAggregate = () => ({
    completed: [{ loopId: '9', loopName: 'CI 修复', runs: 2, totalIterations: 5, lastAtMs: T0 - HOUR }],
    failed: [{ loopId: '7', loopName: '文档巡检', error: 'TypeError: x is not a function', atMs: T0 - 2 * HOUR }],
    awaiting: [{ loopId: '8', loopName: '发布审批', runId: 'run-g-1', interruptId: 'gate-1', waitingMs: 45 * 60_000 }],
    alerts: [{ loopId: '7', loopName: '文档巡检', kind: 'stuck' as const, reason: 'circuit breaker: 3 consecutive failed runs', atMs: T0 - 3 * HOUR }],
    plan: [{ loopId: '11', loopName: '晨报', dueIso: new Date(at(2026, 9, 10, 7, 30)).toISOString() }],
  })

  it('renders all three sections in order with entries', () => {
    const text = renderBrief(fullAggregate(), { dateLabel: '2026-09-10' })
    const iProgress = text.indexOf('【进展】')
    const iDecision = text.indexOf('【等你决策】')
    const iPlan = text.indexOf('【今日计划】')
    expect(iProgress).toBeGreaterThanOrEqual(0)
    expect(iDecision).toBeGreaterThan(iProgress)
    expect(iPlan).toBeGreaterThan(iDecision)
    expect(text).toContain('每日 Brief（2026-09-10）')
    expect(text).toContain('CI 修复：完成 2 个 run（累计 5 次迭代）')
    expect(text).toContain('文档巡检：TypeError: x is not a function')
    expect(text).toContain('发布审批：等待已 45m（run run-g-1）')
    expect(text).toContain('circuit breaker: 3 consecutive failed runs')
    expect(text).toContain('晨报：到期未触发（计划 07:30）')
  })

  it('omits the section header when that section is empty', () => {
    const text = renderBrief({ completed: fullAggregate().completed, failed: [], awaiting: [], alerts: [], plan: [] })
    expect(text).toContain('【进展】')
    expect(text).not.toContain('【等你决策】')
    expect(text).not.toContain('【今日计划】')
  })

  it('returns an empty string for an all-empty aggregate', () => {
    expect(renderBrief({ completed: [], failed: [], awaiting: [], alerts: [], plan: [] })).toBe('')
  })

  it('formats waiting durations under and over one hour', () => {
    const base = { completed: [], failed: [], alerts: [], plan: [] }
    const short = renderBrief({ ...base, awaiting: [{ loopId: '8', loopName: 'A', runId: 'r1', waitingMs: 45 * 60_000 }] })
    expect(short).toContain('等待已 45m')
    const long = renderBrief({ ...base, awaiting: [{ loopId: '8', loopName: 'A', runId: 'r1', waitingMs: 5.2 * HOUR }] })
    expect(long).toContain('等待已 5.2h')
  })

  it('falls back to loopId as the display name when the loop record is gone', () => {
    const text = renderBrief({ completed: [{ loopId: '42', loopName: '42', runs: 1, lastAtMs: T0 }], failed: [], awaiting: [], alerts: [], plan: [] })
    expect(text).toContain('42：完成 1 个 run')
    expect(text).not.toContain('累计')
  })
})

describe('aggregateIsEmpty / readBriefConfig', () => {
  it('treats any non-empty section as data', () => {
    expect(aggregateIsEmpty({ completed: [], failed: [], awaiting: [], alerts: [], plan: [] })).toBe(true)
    expect(aggregateIsEmpty({ completed: [], failed: [], awaiting: [], alerts: [], plan: [{ loopId: '1', loopName: 'x', dueIso: 'x' }] })).toBe(false)
    expect(aggregateIsEmpty({ completed: [], failed: [], awaiting: [], alerts: [{ loopId: '1', loopName: 'x', kind: 'stuck', reason: 'r', atMs: 0 }], plan: [] })).toBe(false)
  })

  it('reads LOOP_BRIEF_CRON / LOOP_BRIEF_ROOM with the 09:00 default', () => {
    expect(readBriefConfig({})).toEqual({ cron: '0 9 * * *', room: undefined })
    expect(readBriefConfig({ LOOP_BRIEF_CRON: '30 14 * * *', LOOP_BRIEF_ROOM: '!r:x' })).toEqual({ cron: '30 14 * * *', room: '!r:x' })
  })
})

describe('collectAggregate（事件日志 + loop 台账聚合）', () => {
  it('aggregates completed/failed/awaiting/alerts/plan for the past 24h', async () => {
    const eventLog = new InMemoryEventLogStore()
    // 完成：24h 窗口内，loop 名与累计迭代数来自 loop 台账
    await seedRun(eventLog, { runId: 'run-a', graphId: 'loop-9', startedAtMs: T0 - 2 * HOUR, completedAtMs: T0 - HOUR })
    // 失败：错误摘要
    await seedRun(eventLog, { runId: 'run-b', graphId: 'loop-7', startedAtMs: T0 - 3 * HOUR, failedAtMs: T0 - 2 * HOUR, error: 'boom-7' })
    // 等待审批：interrupt 未应答（raisedAtMs 5h 前）
    await seedRun(eventLog, {
      runId: 'run-c', graphId: 'loop-8', startedAtMs: T0 - 6 * HOUR,
      interrupt: { id: 'gate-1', raisedAtMs: T0 - 5 * HOUR },
    })
    // 窗口外完成（25h 前）→ 排除
    await seedRun(eventLog, { runId: 'run-old', graphId: 'loop-9', startedAtMs: T0 - 26 * HOUR, completedAtMs: T0 - 25 * HOUR })
    // brief 自身的审计 run → 排除
    await seedRun(eventLog, { runId: 'run-daily-brief-1', graphId: BRIEF_GRAPH_ID, startedAtMs: T0 - HOUR, completedAtMs: T0 - HOUR })

    const loop9 = makeLoop({ id: '9', name: 'CI 修复', stats: { totalIterations: 5, tasksDiscovered: 0, tasksCompleted: 0, tasksBlocked: 0, totalCost: 0, currentIteration: 0 } })
    const store = makeStore({
      loops: [
        loop9,
        makeLoop({ id: '7', name: '文档巡检' }),
        makeLoop({ id: '8', name: '发布审批' }),
        // 今日计划：已到期未触发的 idle loop
        makeLoop({ id: '11', name: '晨报', status: 'idle', nextTickAt: new Date(T0 - 10 * 60_000).toISOString() }),
        // 未来到期 → 不进今日计划；running → 不进
        makeLoop({ id: '12', name: '未来', status: 'idle', nextTickAt: new Date(T0 + HOUR).toISOString() }),
        makeLoop({ id: '13', name: '跑着', status: 'running', nextTickAt: new Date(T0 - HOUR).toISOString() }),
      ],
      eventsByLoop: {
        '7': [
          { type: 'loop.stuck', loopId: '7', reason: 'circuit breaker: 10 consecutive failed runs', ts: new Date(T0 - 3 * HOUR).toISOString() },
          { type: 'loop.escalated', loopId: '7', reason: 'interrupt timeout: human decision required', ts: new Date(T0 - 2 * HOUR).toISOString() },
          // 窗口外告警 → 排除
          { type: 'loop.stuck', loopId: '7', reason: 'old', ts: new Date(T0 - 30 * HOUR).toISOString() },
        ] as LoopEvent[],
      },
    })

    const agg = await collectAggregate({ eventLog, store }, T0)

    expect(agg.completed).toEqual([
      { loopId: '9', loopName: 'CI 修复', runs: 1, totalIterations: 5, lastAtMs: T0 - HOUR },
    ])
    expect(agg.failed).toEqual([
      { loopId: '7', loopName: '文档巡检', error: 'boom-7', atMs: T0 - 2 * HOUR },
    ])
    expect(agg.awaiting).toHaveLength(1)
    expect(agg.awaiting[0]!.loopId).toBe('8')
    expect(agg.awaiting[0]!.loopName).toBe('发布审批')
    expect(agg.awaiting[0]!.runId).toBe('run-c')
    expect(agg.awaiting[0]!.interruptId).toBe('gate-1')
    expect(agg.awaiting[0]!.waitingMs).toBeGreaterThanOrEqual(5 * HOUR - 1_000)
    expect(agg.awaiting[0]!.waitingMs).toBeLessThanOrEqual(5 * HOUR + 1_000)
    expect(agg.alerts).toEqual([
      // 新→旧（desc）
      { loopId: '7', loopName: '文档巡检', kind: 'escalated', reason: 'interrupt timeout: human decision required', atMs: T0 - 2 * HOUR },
      { loopId: '7', loopName: '文档巡检', kind: 'stuck', reason: 'circuit breaker: 10 consecutive failed runs', atMs: T0 - 3 * HOUR },
    ])
    expect(agg.plan).toEqual([
      { loopId: '11', loopName: '晨报', dueIso: new Date(T0 - 10 * 60_000).toISOString() },
    ])
  })

  it('truncates long failure summaries', async () => {
    const eventLog = new InMemoryEventLogStore()
    const longError = 'E'.repeat(500)
    await seedRun(eventLog, { runId: 'run-x', graphId: 'loop-9', startedAtMs: T0 - HOUR, failedAtMs: T0 - HOUR, error: longError })
    const agg = await collectAggregate({ eventLog, store: makeStore() }, T0)
    expect(agg.failed).toHaveLength(1)
    expect(agg.failed[0]!.error.length).toBeLessThanOrEqual(161)
    expect(agg.failed[0]!.error.startsWith('EEEE')).toBe(true)
    expect(agg.failed[0]!.error.endsWith('…')).toBe(true)
  })

  it('resumes already-answered interrupts are not reported as awaiting', async () => {
    const eventLog = new InMemoryEventLogStore()
    await seedRun(eventLog, {
      runId: 'run-ok', graphId: 'loop-9', startedAtMs: T0 - 6 * HOUR,
      interrupt: { id: 'gate-1', raisedAtMs: T0 - 5 * HOUR },
      resumedInterruptIds: ['gate-1'],
    })
    const agg = await collectAggregate({ eventLog, store: makeStore() }, T0)
    expect(agg.awaiting).toHaveLength(0)
  })

  it('returns an all-empty aggregate for a zero-data day', async () => {
    const eventLog = new InMemoryEventLogStore()
    const agg = await collectAggregate({ eventLog, store: makeStore() }, T0)
    expect(aggregateIsEmpty(agg)).toBe(true)
  })
})

describe('DailyBriefJob（触发判定 + 投递 + 审计落账）', () => {
  it('fires once after the daily cron time, then stays quiet for the day', async () => {
    const h = makeJob()
    await seedRun(h.eventLog, { runId: 'run-a', graphId: 'loop-9', startedAtMs: T0 - 2 * HOUR, completedAtMs: T0 - HOUR })
    h.store // loops 无记录 → 名字回退 loopId

    h.clock.now = at(2026, 9, 10, 8, 59)
    await h.job.poll()
    expect(h.deliver).not.toHaveBeenCalled()
    expect(await briefRuns(h.eventLog)).toHaveLength(0)

    h.clock.now = at(2026, 9, 10, 9, 0) + 1_000
    await h.job.poll()
    expect(h.deliver).toHaveBeenCalledTimes(1)
    expect(await briefRuns(h.eventLog)).toHaveLength(1)

    h.clock.now = at(2026, 9, 10, 18, 0)
    await h.job.poll()
    expect(h.deliver).toHaveBeenCalledTimes(1)
    expect(await briefRuns(h.eventLog)).toHaveLength(1)
  })

  it('does not re-send after a restart (watermark lives in the event log)', async () => {
    const h = makeJob()
    await seedRun(h.eventLog, { runId: 'run-a', graphId: 'loop-9', startedAtMs: T0 - 2 * HOUR, completedAtMs: T0 - HOUR })
    h.clock.now = T0 + 1_000
    await h.job.poll()
    expect(await briefRuns(h.eventLog)).toHaveLength(1)

    // 新 job 实例（模拟进程重启）：同一天内经事件日志水位判"今日已发"
    const deliver2 = vi.fn(async () => {})
    const job2 = new DailyBriefJob({
      eventLog: h.eventLog, store: h.store,
      clock: () => T0 + 30 * 60_000, deliver: deliver2, log: () => {},
    })
    await job2.poll()
    expect(deliver2).not.toHaveBeenCalled()
    expect(await briefRuns(h.eventLog)).toHaveLength(1)
  })

  it('fires again the next day at the configured time', async () => {
    const h = makeJob({ cron: '30 14 * * *' })
    await seedRun(h.eventLog, { runId: 'run-a', graphId: 'loop-9', startedAtMs: T0, completedAtMs: T0 })

    h.clock.now = at(2026, 9, 10, 14, 29)
    await h.job.poll()
    expect(h.deliver).not.toHaveBeenCalled()

    h.clock.now = at(2026, 9, 10, 14, 31)
    await h.job.poll()
    expect(h.deliver).toHaveBeenCalledTimes(1)

    // 次日窗口内出现新数据 → 次日触发点后再次投递
    await seedRun(h.eventLog, {
      runId: 'run-d2', graphId: 'loop-9',
      startedAtMs: at(2026, 9, 11, 13, 0), completedAtMs: at(2026, 9, 11, 13, 30),
    })
    h.clock.now = at(2026, 9, 11, 14, 31)
    await h.job.poll()
    expect(h.deliver).toHaveBeenCalledTimes(2)
  })

  it('zero-data day: no delivery, no audit records, and no late same-day catch-up', async () => {
    const h = makeJob()
    h.clock.now = T0 + 1_000
    await h.job.poll()
    expect(h.deliver).not.toHaveBeenCalled()
    expect(await briefRuns(h.eventLog)).toHaveLength(0)

    // 当天晚些时候出现了数据 → 也不补发（每日固定时刻语义，错过即次日）
    await seedRun(h.eventLog, { runId: 'run-a', graphId: 'loop-9', startedAtMs: T0 + HOUR, completedAtMs: T0 + HOUR })
    h.clock.now = T0 + 2 * HOUR
    await h.job.poll()
    expect(h.deliver).not.toHaveBeenCalled()
    expect(await briefRuns(h.eventLog)).toHaveLength(0)
  })

  it('records the brief itself as an auditable run with delivered flag and section counts', async () => {
    const h = makeJob()
    await seedRun(h.eventLog, { runId: 'run-a', graphId: 'loop-9', startedAtMs: T0 - 2 * HOUR, completedAtMs: T0 - HOUR })
    h.clock.now = T0 + 1_000
    await h.job.poll()

    const runs = await briefRuns(h.eventLog)
    expect(runs).toHaveLength(1)
    const runId = runs[0]!.runId
    const events = await h.eventLog.query(runId)
    expect(events.map(e => e.kind)).toEqual(['run.started', 'run.completed'])
    const done = events.find(e => e.kind === 'run.completed')!
    expect(done.payload.delivered).toBe(true)
    expect(done.payload.sections).toEqual({ progress: 1, decisions: 0, alerts: 0, plan: 0 })
    // 投递文本 = renderBrief 产物（三段式）；job 的 store 无 loop 记录 → 名字回退 loopId
    const text = h.deliver.mock.calls[0]![0] as string
    expect(text).toContain('【进展】')
    expect(text).toContain('✅ 9：完成 1 个 run')
  })

  it('keeps the audit trail and marks delivered:false when the transport rejects', async () => {
    const h = makeJob({ deliver: vi.fn(async () => { throw new Error('matrix down') }) })
    await seedRun(h.eventLog, { runId: 'run-a', graphId: 'loop-9', startedAtMs: T0 - 2 * HOUR, completedAtMs: T0 - HOUR })
    h.clock.now = T0 + 1_000
    await expect(h.job.poll()).resolves.toBeUndefined()

    const runs = await briefRuns(h.eventLog)
    expect(runs).toHaveLength(1)
    const events = await h.eventLog.query(runs[0]!.runId)
    const done = events.find(e => e.kind === 'run.completed')!
    expect(done.payload.delivered).toBe(false)
    expect(done.payload.error).toBe('matrix down')
  })

  it('falls back to event-log-only when no delivery channel is injected', async () => {
    const h = makeJob({ deliver: null })
    await seedRun(h.eventLog, { runId: 'run-a', graphId: 'loop-9', startedAtMs: T0 - 2 * HOUR, completedAtMs: T0 - HOUR })
    h.clock.now = T0 + 1_000
    await h.job.poll()

    expect(h.deliver).not.toHaveBeenCalled()
    const runs = await briefRuns(h.eventLog)
    expect(runs).toHaveLength(1)
    const events = await h.eventLog.query(runs[0]!.runId)
    expect(events.find(e => e.kind === 'run.completed')!.payload.delivered).toBe(false)
  })

  it('falls back to the default cron when LOOP_BRIEF_CRON is unparseable', async () => {
    const h = makeJob({ cron: 'not-a-cron' })
    await seedRun(h.eventLog, { runId: 'run-a', graphId: 'loop-9', startedAtMs: T0 - 2 * HOUR, completedAtMs: T0 - HOUR })
    h.clock.now = T0 + 1_000
    await h.job.poll()
    expect(h.deliver).toHaveBeenCalledTimes(1)
  })

  it('runOnce bypasses the due check (manual/testing entry) but still skips zero-data days', async () => {
    const h = makeJob()
    h.clock.now = at(2026, 9, 10, 3, 0) // 早于默认 09:00 触发点
    await seedRun(h.eventLog, {
      runId: 'run-a', graphId: 'loop-9',
      startedAtMs: at(2026, 9, 10, 1, 0), completedAtMs: at(2026, 9, 10, 2, 0),
    })
    const agg = await h.job.runOnce()
    expect(agg.completed).toHaveLength(1)
    expect(h.deliver).toHaveBeenCalledTimes(1)

    const empty = await makeJob().job.runOnce()
    expect(aggregateIsEmpty(empty)).toBe(true)
  })

  it('start() polls on the interval and stop() cancels it', async () => {
    vi.useFakeTimers()
    try {
      const h = makeJob({ intervalMs: 100 })
      await seedRun(h.eventLog, { runId: 'run-a', graphId: 'loop-9', startedAtMs: T0 - 2 * HOUR, completedAtMs: T0 - HOUR })
      h.clock.now = T0 + 1_000

      h.job.start()
      await vi.advanceTimersByTimeAsync(150)
      expect(h.deliver).toHaveBeenCalledTimes(1)

      h.job.stop()
      h.clock.now = at(2026, 9, 11, 9, 1)
      await vi.advanceTimersByTimeAsync(1_000)
      expect(h.deliver).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})

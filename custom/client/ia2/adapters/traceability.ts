// overlay/custom/client/ia2/adapters/traceability.ts
// P3 Task 7 — 工作项 ↔ run 双向关联 + 追溯矩阵纯函数投影层（§8 工作项关联 / §7B.2 追溯矩阵）。
//
// 数据根（显式关联替代正则提取，spec §8）：
// - 服务端 persistence 成功后 `loop.persisted` 事件携带 taskId + runId（phase-nodes
//   透传 KanbanPersistenceAdapter.createTask 返回 id 与图 run id），契约台账另写
//   persistedTaskId——本文件不做任何 title/`kanban:` 前缀字符串反解。
// - 事件输入为 LoopEvent（loop 通道词汇，type）与 replay GraphLogEvent（日志词汇，
//   kind + payload）的结构化最小子集；两个词汇各有专属入口，不互猜。
//
// 全部纯函数、零 store 零 DOM（同 overview/orchestrate adapter 纪律）：
//   buildTraceMatrix        需求(loop goal) → run(状态/迭代) → 产出任务 → 验证轮次，按 loop 分组
//   persistedLinksForTask   任务 → run 反查（RunLinks.vue 消费）
//   persistedTaskLinksOfRun run → 任务（NodeInspector persistence 节点消费）

/** loop 通道事件的结构化最小子集（LoopEvent 超集：多余字段被忽略） */
export interface TraceLoopEvent {
  type?: string
  ts?: string | number
  loopId?: string
  contractId?: string
  taskId?: string
  runId?: string
  artifact?: string
  passed?: boolean
  iteration?: number
}

/** kanban 任务 join 输入（标题/状态列） */
export interface TraceTaskInput {
  id: string
  title?: string | null
  status?: string | null
}

/** run 状态 join 输入（runs store 投影；缺省 = 状态未知，不阻塞矩阵） */
export interface TraceRunInput {
  runId: string
  status?: string | null
}

export interface TraceLoopInput {
  id: string
  name?: string | null
  goal?: string | null
}

// ---------------------------------------------------------------------------
// ts 工具（双词汇：ISO 字符串 ∪ epoch ms 数字；坏值 null）
// ---------------------------------------------------------------------------

function tsMs(v: string | number | undefined | null): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const t = Date.parse(v)
    if (Number.isFinite(t)) return t
  }
  return null
}

// ---------------------------------------------------------------------------
// 任务 → run 反查（RunLinks.vue）
// ---------------------------------------------------------------------------

export interface PersistedLink {
  runId: string | null
  contractId: string
  artifact: string | null
  ts: string | number | null
}

/**
 * 按 taskId 显式匹配 loop.persisted 事件（taskId === 入参），返回 run 深链数据。
 * 最近优先（同名任务 repair 回边可能多次 persist，均真实有效）。
 * 无 taskId 的旧事件不参与匹配——不做 artifact 字符串反解（显式关联替代正则的边界）。
 */
export function persistedLinksForTask(events: TraceLoopEvent[], taskId: string): PersistedLink[] {
  if (!taskId) return []
  return events
    .filter(e => e.type === 'loop.persisted' && e.taskId === taskId)
    .map(e => ({
      runId: typeof e.runId === 'string' && e.runId ? e.runId : null,
      contractId: e.contractId ?? '',
      artifact: e.artifact ?? null,
      ts: e.ts ?? null,
    }))
    .sort((a, b) => (tsMs(b.ts) ?? 0) - (tsMs(a.ts) ?? 0))
}

// ---------------------------------------------------------------------------
// run → 任务（NodeInspector，replay 事件词汇）
// ---------------------------------------------------------------------------

export interface PersistedTaskLink {
  contractId: string
  taskId: string
}

/** replay 事件的结构化最小子集（GraphLogEvent / socket GraphEvent 超集） */
export interface TraceReplayEvent {
  kind?: string
  type?: string
  ts?: string | number
  payload?: Record<string, unknown>
}

/**
 * 从 run 的 replay 事件流读取产物任务链接（kind/type === 'loop.persisted'，
 * taskId 取事件 payload——graph-runtime 已对 loop.* 事件整体透传 payload）。
 * 缺 taskId 的条目剔除（dryrun 标记 / 旧数据）。
 */
export function persistedTaskLinksOfRun(events: TraceReplayEvent[]): PersistedTaskLink[] {
  const out: PersistedTaskLink[] = []
  for (const e of events) {
    const kind = e.kind ?? e.type
    if (kind !== 'loop.persisted') continue
    const payload = e.payload ?? {}
    const contractId = typeof payload.contractId === 'string' ? payload.contractId : ''
    const taskId = typeof payload.taskId === 'string' ? payload.taskId : ''
    if (!contractId || !taskId) continue
    out.push({ contractId, taskId })
  }
  return out
}

// ---------------------------------------------------------------------------
// 追溯矩阵（§7B.2）
// ---------------------------------------------------------------------------

export interface TraceTaskRow {
  contractId: string
  /** 产物 kanban 任务 id（null = 旧事件无显式关联，行保留、链接不渲染） */
  taskId: string | null
  taskTitle: string | null
  taskStatus: string | null
  /** 验证轮次（loop.verification-complete 按 contract 计数） */
  rounds: { total: number; passed: number; failed: number }
  /** 最近一轮验证结果（无验证记录为 null） */
  lastRoundPassed: boolean | null
  /** 最近一次落库时刻（原样透传，渲染层格式化） */
  persistedAt: string | number | null
}

export interface TraceRunRow {
  /** null = 事件无 runId（legacy 引擎），单独分桶不丢数据 */
  runId: string | null
  /** runs store 状态 join（无匹配为 null） */
  runStatus: string | null
  /** 落库所属 tick 序号 = 此前 loop.tick-complete 计数 + 1；无 tick 事件为 null */
  iteration: number | null
  tasks: TraceTaskRow[]
}

export interface TraceLoopGroup {
  loopId: string
  loopName: string
  goal: string
  runs: TraceRunRow[]
}

export interface TraceMatrixInput {
  loops: TraceLoopInput[]
  /** 全部 loop 事件合并输入（每个事件自带 loopId） */
  events: TraceLoopEvent[]
  tasks?: TraceTaskInput[]
  runs?: TraceRunInput[]
}

/** 矩阵聚合入口：
 * - 分组 = loops 输入顺序（无 persisted 事件的 loop 保留空 runs，PM 可见"需求尚未产出"）；
 * - 行锚点 = loop.persisted（产出任务）；同一契约多次 persist 取最新 taskId/时刻；
 * - run 桶 = 事件 runId（null 单独分桶）；组内按最近落库倒序；
 * - 验证轮次/迭代归属均按事件 ts 时序推导，全部可从纯事件序列复算。 */
export function buildTraceMatrix(input: TraceMatrixInput): TraceLoopGroup[] {
  const taskById = new Map((input.tasks ?? []).map(t => [t.id, t]))
  const runStatusById = new Map((input.runs ?? []).map(r => [r.runId, r.status ?? null]))

  // 事件按 loop 预分桶（ts 无法解析的事件排最前，时序推导按"最早"处理——不丢数据）
  const eventsByLoop = new Map<string, TraceLoopEvent[]>()
  for (const e of input.events) {
    if (e.type !== 'loop.persisted' && e.type !== 'loop.tick-complete' && e.type !== 'loop.verification-complete') {
      continue
    }
    const loopId = e.loopId
    if (!loopId) continue
    const bucket = eventsByLoop.get(loopId) ?? []
    bucket.push(e)
    eventsByLoop.set(loopId, bucket)
  }

  return input.loops.map(loop => {
    const events = (eventsByLoop.get(loop.id) ?? [])
      .slice()
      .sort((a, b) => (tsMs(a.ts) ?? 0) - (tsMs(b.ts) ?? 0))

    // tick 序号推导：persisted 事件 ts 之前的 tick-complete 计数 + 1
    const tickCountBefore = (ts: number | null): number | null => {
      if (ts === null) return null
      let n = 0
      for (const e of events) {
        if (e.type !== 'loop.tick-complete') continue
        const t = tsMs(e.ts)
        if (t !== null && t <= ts) n++
      }
      return n + 1
    }

    // run 桶：runId → 该 run 的 persisted 事件（含 null 桶）
    const runsByBucket = new Map<string | null, TraceLoopEvent[]>()
    for (const e of events) {
      if (e.type !== 'loop.persisted') continue
      if (!e.contractId) continue // 畸形事件（缺契约）不成行
      const key = typeof e.runId === 'string' && e.runId ? e.runId : null
      const bucket = runsByBucket.get(key) ?? []
      bucket.push(e)
      runsByBucket.set(key, bucket)
    }

    // 验证轮次流水（按契约）
    const roundsByContract = new Map<string, { total: number; passed: number; failed: number; last: boolean | null }>()
    for (const e of events) {
      if (e.type !== 'loop.verification-complete' || !e.contractId) continue
      const rec = roundsByContract.get(e.contractId) ?? { total: 0, passed: 0, failed: 0, last: null }
      rec.total++
      if (e.passed === true) rec.passed++
      else if (e.passed === false) rec.failed++
      rec.last = e.passed === true
      roundsByContract.set(e.contractId, rec)
    }

    const runs: TraceRunRow[] = [...runsByBucket.entries()].map(([runId, persisted]) => {
      const latestByContract = new Map<string, TraceLoopEvent>()
      for (const e of persisted) latestByContract.set(e.contractId!, e)
      const tasks: TraceTaskRow[] = [...latestByContract.entries()].map(([contractId, e]) => {
        const task = e.taskId !== undefined ? taskById.get(e.taskId) : undefined
        const rounds = roundsByContract.get(contractId)
        return {
          contractId,
          taskId: e.taskId ?? null,
          taskTitle: task?.title ?? null,
          taskStatus: task?.status ?? null,
          rounds: rounds
            ? { total: rounds.total, passed: rounds.passed, failed: rounds.failed }
            : { total: 0, passed: 0, failed: 0 },
          lastRoundPassed: rounds?.last ?? null,
          persistedAt: e.ts ?? null,
        }
      })
      const persistedTimes = persisted
        .map(e => tsMs(e.ts))
        .filter((t): t is number => t !== null)
      const latestMs = persistedTimes.length ? Math.max(...persistedTimes) : 0
      const row: TraceRunRow = {
        runId,
        runStatus: runId !== null ? (runStatusById.get(runId) ?? null) : null,
        iteration: tickCountBefore(persistedTimes.length ? latestMs : null),
        tasks,
      }
      // 组内排序锚点：该 run 最近一次落库时刻（装饰后排序，剥装饰再返回）
      return { row, latestMs }
    })
      .sort((a, b) => b.latestMs - a.latestMs)
      .map(({ row }) => row)

    return {
      loopId: loop.id,
      loopName: loop.name ?? loop.id,
      goal: loop.goal ?? '',
      runs,
    }
  })
}


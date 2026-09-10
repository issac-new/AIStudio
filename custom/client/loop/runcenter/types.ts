// overlay/custom/client/loop/runcenter/types.ts
// 运行中心客户端类型 — 结构化最小形状，避免 custom→server/upstream import
// （与 graph-socket.ts 的 SocketIOLike 同一纪律：跨层只共享结构不共享模块）。

/** 图运行状态（对齐服务端 GraphStatus；REST listRuns 对已卸载 run 返回 'unknown'） */
export type RunStatus =
  | 'idle' | 'running' | 'paused' | 'awaiting-input' | 'completed' | 'failed'
  | 'unknown'

/** 业务阶段（双轴投影产物）：五阶段主干 + gate/stop（图轴 gate / stop-check 折叠） */
export type RunStage =
  | 'discovery' | 'handoff' | 'validation' | 'persistence' | 'gate' | 'stop'

/** 合法操作集（转换是按钮；按钮显隐由 status 驱动，不存在任意跳转） */
export type RunAction = 'approve' | 'peek' | 'replay' | 'fork' | 'detail'

/** /graph namespace 事件的最小结构形状（GraphEvent + loop.* 桥接事件的公共超集）。
 *  事件名沿用服务端 GraphEvent.type 原值（graph.node-complete 等），前端零翻译。
 *  双词汇（审查修复）：graph:history 推的是事件日志 GraphLogEvent——runId/kind/epoch ts/
 *  payload（event-log-store）；graph:event 推 GraphEvent——threadId/type/ISO ts。
 *  store 与投影函数必须两词汇通吃，见 adapters 的词汇归一表。 */
export interface GraphEventLike {
  type: string
  /** 日志词汇的事件名（interrupt.raised 等）——graph:history 载体；与 type 二选一 */
  kind?: string
  /** 事件幂等 id（P3 台账）：`<runId>-<seq>`，history 与实时流同源；store 按 eid 去重 */
  eid?: string
  graphId?: string
  /** 即 runId（服务端以 threadId 为 run 房间键） */
  threadId?: string
  /** 日志词汇的 run 字段（GraphLogEvent.runId）；与 threadId 二选一 */
  runId?: string
  /** 事件时刻：socket 词汇 ISO 字符串 ∪ 日志词汇 epoch ms */
  ts: string | number
  step?: number
  /** 日志词汇的 super-step（与 step 同义） */
  superStep?: number
  nodeId?: string
  interruptId?: string
  /** cost.recorded / graph.completed 的累计成本 */
  totalCost?: number
  /** loop.stage-transition 的 legacy 业务阶段 */
  to?: string
  error?: string
  /** 日志词汇的载荷（interrupt 值 / goto / updateKeys / error 在此） */
  payload?: Record<string, unknown>
  [key: string]: unknown
}

/** REST GET /api/graph/runs 的列表项（graph-rest.ts listRuns 投影） */
export interface RunListItem {
  runId: string
  graphId: string
  status: RunStatus
  updatedAt: string | null
}

/** 运行中心行模型：REST 快照 + 事件日志投影（stage/迭代/最后活动/成本由纯函数派生） */
export interface RunSummary {
  runId: string
  graphId: string
  status: RunStatus
  /** REST 侧 updatedAt（无事件缓冲时的最后活动兜底） */
  updatedAt: string | null
  /** deriveStage 投影：最近 stage-transition / graph 节点事件推导的业务阶段 */
  stage: RunStage | null
  /** deriveIteration 投影：事件最大 super-step */
  iteration: number
  /** deriveLastActivityAt 投影：事件最大 ts（无事件时回落 updatedAt） */
  lastActivityAt: string | null
  /** deriveCost 投影：累计成本 */
  cost: number
  /** 事件缓冲（有界，最新在后；投影函数的唯一事实源） */
  events: GraphEventLike[]
  /** 未决审批 interruptId（latestOpenInterrupt 投影；approve 操作所需） */
  pendingInterruptId: string | null
}

/** 相对时间 i18n token（组件层翻译成 runcenter.time.* 文案） */
export interface RelativeTimeToken {
  key: 'justNow' | 'minutesAgo' | 'hoursAgo' | 'daysAgo'
  n?: number
}

/** fetchMetrics 采集的单 run 回放切片（仅成功拉取的 run；平均耗时样本输入） */
export interface MetricsReplaySlice {
  runId: string
  events: GraphEventLike[]
}

/** fetchMetrics 采集的单 loop 事件切片。结构化最小形状（type/ts 即所需全部），
 *  不与 loop 模块的 LoopEvent 联合类型耦合（跨层只共享结构不共享模块）。 */
export interface MetricsLoopEventSlice {
  loopId: string
  events: Array<{ type?: string; ts?: string | number; [key: string]: unknown }>
}

/** 近 7 天指标原始采集包（fetchMetrics 产物，store 只采集不计算——投影纪律）。
 *  业务聚合（成功率/平均耗时/熔断计数）在消费侧纯函数：
 *  ia2/adapters/overview.ts aggregateMetrics。 */
export interface MetricsRaw {
  /** REST listRuns 全量快照（成功率按状态聚合的输入） */
  runs: RunListItem[]
  /** 最近 N 个近窗终态 run 的回放（平均耗时样本） */
  replays: MetricsReplaySlice[]
  /** 各 loop 近窗事件切片（熔断 loop.stuck 计数输入） */
  loopEvents: MetricsLoopEventSlice[]
  /** 采集完成时刻（epoch ms；5 分钟 TTL 的时间锚） */
  collectedAt: number
}

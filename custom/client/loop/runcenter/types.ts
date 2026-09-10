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
 *  事件名沿用服务端 GraphEvent.type 原值（graph.node-complete 等），前端零翻译。 */
export interface GraphEventLike {
  type: string
  graphId?: string
  /** 即 runId（服务端以 threadId 为 run 房间键） */
  threadId?: string
  ts: string
  step?: number
  nodeId?: string
  interruptId?: string
  /** cost.recorded / graph.completed 的累计成本 */
  totalCost?: number
  /** loop.stage-transition 的 legacy 业务阶段 */
  to?: string
  error?: string
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

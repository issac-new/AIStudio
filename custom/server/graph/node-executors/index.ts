// overlay/custom/server/graph/node-executors/index.ts
// 一期对接层（设计正本 docs/superpowers/specs/2026-10-08-team-parallel-dev-capability.md）：
// 26 步模板六种节点类型（agent-task/agent-review/agent-test/human-gate/dispatch/report-gen）
// 的 registry 实现——"图节点 fire → kanban 认领 → spawn AI 员工"。
// 哲学：kanban 卡状态是唯一完成真值（spawn 是建议、卡是事实）；本模块不自己 spawn，
// 只建卡/等卡（并发帽/熔断/心跳全归现有派发器，单一事实源）。
// DI：KanbanBridge 由装配方注入（graph-assembly factory-DI 哲学，不 import 上游代码）；
// 缺省 DryRunKanbanBridge（shadow 冒烟用：即建即完，不真派发）。

import type { NodeRegistry } from '../../loop/graph/node-registry'
import type { CustomReducers } from '../../loop/graph/graph-spec'
import type { NodeResult, StateUpdate } from '../../loop/graph/types'

// ============================================================================
// 模板域 reducer——26 步模板通道声明 appendById（先例：graph-compiler 的
// contracts 通道 appendContractsById，经 hydrate 第三参注入）。
// 语义：按条目身份去重追加（id ?? node ?? task，首见为准）——节点重放/幂等重跑
// 不产生重复台账。
// ============================================================================
export const SIMULATION_REDUCERS: CustomReducers = {
  // 注意：CustomReducers 值是 reducer 本体（非工厂）——hydrate 直接采用（graph-spec.ts:288-294）
  appendById: (old: Array<Record<string, unknown>> | undefined, next: Array<Record<string, unknown>>) => {
    const merged = [...(old ?? [])]
    const seen = new Set(merged.map((e) => e.id ?? e.node ?? e.task))
    for (const e of next ?? []) {
      const key = e.id ?? e.node ?? e.task
      if (key !== undefined && seen.has(key)) continue
      merged.push(e)
      if (key !== undefined) seen.add(key)
    }
    return merged
  },
}

// ============================================================================
// KanbanBridge — 图节点 ↔ kanban 的唯一通道（生产=REST/进程内服务，二期接线）
// ============================================================================

export interface KanbanTaskRef {
  id: string
  status: string
}

export interface KanbanCreateRequest {
  title: string
  body: Record<string, unknown>
  assignee?: string
  board?: string
  /** 幂等键（复用 kanban tasks.idempotency_key 列）：graph_node:<runId>:<nodeId> */
  idempotencyKey: string
}

export interface KanbanBridge {
  createTask(req: KanbanCreateRequest): Promise<KanbanTaskRef>
  getTask(id: string): Promise<KanbanTaskRef>
}

/** 卡终态（与 hermes_cli/kanban_db.py 状态机对齐；review 留给 gate 类节点） */
const DONE_STATUSES = new Set(['done', 'archived'])
const FAILED_STATUSES = new Set(['blocked'])

/**
 * Dry-run 桥（shadow 冒烟）：即建即完 + 幂等键去重，不真派发。
 * 事件留痕于内存，测试可断言建卡意图。
 */
export class DryRunKanbanBridge implements KanbanBridge {
  readonly created: KanbanCreateRequest[] = []
  private byKey = new Map<string, KanbanTaskRef>()
  private seq = 0

  async createTask(req: KanbanCreateRequest): Promise<KanbanTaskRef> {
    const existing = this.byKey.get(req.idempotencyKey)
    if (existing) return existing
    const ref: KanbanTaskRef = { id: `dry-t${++this.seq}`, status: 'done' }
    this.byKey.set(req.idempotencyKey, ref)
    this.created.push(req)
    return ref
  }

  async getTask(id: string): Promise<KanbanTaskRef> {
    for (const ref of this.byKey.values()) {
      if (ref.id === id) return ref
    }
    throw new Error(`DryRunKanbanBridge: unknown task ${id}`)
  }
}

// ============================================================================
// HttpKanbanBridge — 真桥（二期）：走 SwarmStudio 既有 kanban REST
// （POST /api/hermes/kanban 建卡、GET /api/hermes/kanban/:id 查卡；路由=上游
// routes/kanban.ts:48-49）。卡状态是唯一完成真值——本桥只建/查，spawn 仍归
// hermes-agent 派发器。结构化 body 经 JSON 字符串随卡落库（estimate_days 等）。
// ============================================================================

export interface HttpKanbanBridgeOpts {
  baseUrl: string
  fetchImpl?: typeof fetch
  board?: string
  log?: (msg: string) => void
}

export class HttpKanbanBridge implements KanbanBridge {
  private readonly base: string
  private readonly doFetch: typeof fetch
  private readonly board?: string
  private readonly log: (msg: string) => void

  constructor(opts: HttpKanbanBridgeOpts) {
    this.base = opts.baseUrl.replace(/\/+$/, '')
    this.doFetch = opts.fetchImpl ?? globalThis.fetch.bind(globalThis)
    this.board = opts.board
    this.log = opts.log ?? (() => {})
  }

  private normalize(data: unknown): KanbanTaskRef {
    const t = ((data as { task?: unknown })?.task ?? data) as Record<string, unknown>
    const id = t?.id ?? t?.task_id
    if (id === undefined || id === null) {
      throw new Error(`HttpKanbanBridge: response carries no task id: ${JSON.stringify(data).slice(0, 200)}`)
    }
    return { id: String(id), status: String(t?.status ?? 'todo') }
  }

  private async json(url: string, init?: RequestInit): Promise<unknown> {
    const res = await this.doFetch(url, init)
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`HttpKanbanBridge: ${init?.method ?? 'GET'} ${url} → ${res.status}: ${text.slice(0, 200)}`)
    }
    return res.json()
  }

  async createTask(req: KanbanCreateRequest): Promise<KanbanTaskRef> {
    const payload: Record<string, unknown> = {
      title: req.title,
      body: JSON.stringify(req.body),
      assignee: req.assignee,
      idempotencyKey: req.idempotencyKey,
    }
    if (this.board) payload.board = this.board
    this.log(`createTask POST ${this.base}/api/hermes/kanban (${req.title})`)
    return this.normalize(await this.json(`${this.base}/api/hermes/kanban`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }))
  }

  async getTask(id: string): Promise<KanbanTaskRef> {
    return this.normalize(await this.json(`${this.base}/api/hermes/kanban/${encodeURIComponent(id)}`))
  }
}

// ============================================================================
// 节点执行器注册
// ============================================================================

export interface SimulationNodeOpts {
  bridge?: KanbanBridge
  /** agent-task 等卡轮询间隔 ms（缺省 15s；测试注小值） */
  pollIntervalMs?: number
  /** 轮询退避上限 ms（缺省 60s） */
  pollMaxIntervalMs?: number
  /** 等卡默认超时 ms（缺省 4h，对齐模板 limits.maxDurationMs） */
  taskTimeoutMs?: number
  log?: (msg: string) => void
}

interface AgentTaskConfig {
  id?: string
  title?: string
  brief?: string
  assignee?: string
  board?: string
  /** 工作量（人日）——二期 estimate 落库后此字段进派发加权 */
  estimateDays?: number
  acceptance?: string
  branchHint?: string
  raci?: { responsible?: string; approver?: string; consulted?: string[]; informed?: string[] }
  /** 完成信号写入的通道名（模板默认每模块 review/test 判定通道） */
  channel?: string
  /** 测试/评审预设（specialist-presets 六闸守门员 prompt 资产二期接线） */
  kind?: 'task' | 'review' | 'test'
  timeoutMs?: number
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

function agentTaskNodeResult(cfg: AgentTaskConfig, taskId: string, ts: number): NodeResult {
  const channel = cfg.channel ?? 'agentRequest'
  return {
    update: {
      [channel]: [{ node: cfg.id, task: taskId, kind: cfg.kind ?? 'task', ts }],
    } as unknown as StateUpdate,
  }
}

/** 等卡完成：done→返回；blocked→抛错走 onError；超时→抛错。轮询指数退避。 */
async function waitForCard(
  bridge: KanbanBridge,
  taskId: string,
  opts: Required<Pick<SimulationNodeOpts, 'pollIntervalMs' | 'pollMaxIntervalMs' | 'taskTimeoutMs'>>,
  label: string,
  log?: (msg: string) => void,
): Promise<KanbanTaskRef> {
  const deadline = Date.now() + opts.taskTimeoutMs
  let interval = opts.pollIntervalMs
  while (Date.now() < deadline) {
    const ref = await bridge.getTask(taskId)
    if (DONE_STATUSES.has(ref.status)) return ref
    if (FAILED_STATUSES.has(ref.status)) {
      throw new Error(`${label}: kanban task ${taskId} blocked（走 onError 路径）`)
    }
    log?.(`${label}: waiting card ${taskId} (status=${ref.status})`)
    await sleep(interval)
    interval = Math.min(interval * 2, opts.pollMaxIntervalMs)
  }
  throw new Error(`${label}: kanban task ${taskId} 超时 ${opts.taskTimeoutMs}ms 未完成`)
}

export const SIMULATION_NODE_TYPES = [
  'agent-task',
  'agent-review',
  'agent-test',
  'human-gate',
  'dispatch',
  'report-gen',
] as const

/**
 * 注册 26 步模板六种节点类型。幂等（重复注册覆盖同工厂）。
 * dispatch=直通屏障（fan-out 由无条件出边承载，同 spec-runtime 'fanout' 语义）；
 * human-gate=interrupt（复用 runtime HITL/resume 流）；report-gen=deps.fnTable 查表。
 */
export function registerSimulationNodeTypes(
  registry: NodeRegistry,
  opts: SimulationNodeOpts = {},
): NodeRegistry {
  const bridge = opts.bridge ?? new DryRunKanbanBridge()
  const poll = {
    pollIntervalMs: opts.pollIntervalMs ?? 15_000,
    pollMaxIntervalMs: opts.pollMaxIntervalMs ?? 60_000,
    taskTimeoutMs: opts.taskTimeoutMs ?? 4 * 3600_000,
  }
  const log = opts.log ?? (() => {})

  const agentTaskFactory = (kind: 'task' | 'review' | 'test') => (config: Record<string, unknown>) => {
    const cfg = { kind, ...(config as unknown as AgentTaskConfig) }
    return {
      id: cfg.id as string,
      type: 'function' as const,
      label: cfg.title ?? (cfg.id as string),
      // joinMode/onError 由 hydrate 按 spec 层值合并（graph-spec.ts:301-306），工厂不设
      execute: async (_state: unknown, ctx: { threadId: string }): Promise<NodeResult> => {
        const title = cfg.title ?? cfg.id ?? 'untitled'
        const ref = await bridge.createTask({
          title,
          body: {
            brief: cfg.brief ?? '',
            estimate_days: cfg.estimateDays,
            acceptance: cfg.acceptance,
            branch_hint: cfg.branchHint,
            raci: cfg.raci,
            graph_node: cfg.id,
            graph_kind: kind,
          },
          assignee: cfg.assignee,
          board: cfg.board,
          idempotencyKey: `graph_node:${ctx.threadId}:${cfg.id}`,
        })
        log(`agent-${kind} '${cfg.id}': card ${ref.id} created (${title})`)
        await waitForCard(bridge, ref.id, poll, `agent-${kind} '${cfg.id}'`, log)
        return agentTaskNodeResult(cfg, ref.id, Date.now())
      },
      timeout: (cfg.timeoutMs as number | undefined) ?? poll.taskTimeoutMs + 60_000,
    }
  }

  registry.register('agent-task', agentTaskFactory('task'))
  registry.register('agent-review', agentTaskFactory('review'))
  registry.register('agent-test', agentTaskFactory('test'))

  registry.register('human-gate', (config) => ({
    id: config.id as string,
    type: 'human' as const,
    label: (config.label as string) ?? (config.gate as string) ?? (config.id as string),
    execute: async (state: unknown): Promise<NodeResult> => ({
      interrupt: {
        value: {
          prompt: (config.prompt as string) ?? `gate '${config.gate ?? config.id}' 等待人工放行`,
          gate: config.gate,
          state,
        },
        id: `${config.id}-gate`,
      },
    }),
    timeout: (config.timeoutMs as number) ?? 86400_000,
  }))

  registry.register('dispatch', (config) => ({
    id: config.id as string,
    type: 'function' as const,
    label: (config.label as string) ?? (config.id as string),
    // 直通屏障：fan-out=本节点的多条无条件出边（BSP 同 super-step 真并行）；
    // 记录派发时刻入通道供审计回放
    execute: async (): Promise<NodeResult> => ({
      update: {
        [(config.channel as string) ?? 'dispatch.mark']: [
          { node: config.id, targets: config.targets ?? null, ts: Date.now() },
        ],
      } as unknown as StateUpdate,
    }),
    timeout: 60_000,
  }))

  registry.register('report-gen', (config) => ({
    id: config.id as string,
    type: 'function' as const,
    label: (config.label as string) ?? (config.id as string),
    execute: async (_state: unknown, ctx: { deps: { fnTable?: Record<string, unknown> } }): Promise<NodeResult> => {
      const name = (config.command as string) ?? 'reportGen'
      const fn = ctx.deps?.fnTable?.[name]
      if (typeof fn !== 'function') {
        throw new Error(`report-gen '${config.id}': deps.fnTable['${name}'] 未接线（报告生成器属 harness 侧，图执行轮接 CLI）`)
      }
      return (fn as (s: unknown, c: unknown) => Promise<NodeResult>)(_state, ctx)
    },
    timeout: (config.timeoutMs as number) ?? 600_000,
  }))

  return registry
}

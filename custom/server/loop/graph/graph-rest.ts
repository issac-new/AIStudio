// overlay/custom/server/loop/graph/graph-rest.ts
// P1 Task 7 — graph REST 真实化（run CRUD/resume/fork/replay + specs）
//
// 与 controllers/graph.ts 的 GET 投影端点（/api/graph/graphs*，loop 只读映射）并存：
// 本模块是图引擎一等 REST（/api/graph/runs*、/api/graph/specs），HITL 闭环
// POST /api/graph/runs/:id/resume 是审批/中断的真人恢复入口。

import Router from '@koa/router'
import { promises as fs } from 'fs'
import type { GraphService } from './graph-service'
import type { EventLogStore } from './event-log-store'
import type { RunSpawner } from './run-spawner'
import type { GraphSpec } from './graph-spec'

const ID_RE = /^[A-Za-z0-9._-]+$/

/**
 * 审批身份服务端盖章（2026-09-10 风险审查 #1）：把 resume 值中的 approver 覆写为认证主体
 * （ctx.state.user.username，由上游 requireUserJwt 写入；与前端 getStoredUsername 解码的
 * 同一 JWT username 字段同源）。客户端自报的 approver 可任意伪造，而 specified/all/majority
 * 策略（phase-nodes evaluateApprovalPolicy）建立在决策者身份上——不覆写等于任何持 token
 * 用户可冒名满足审批。decision 形状归一与 phase-nodes normalizeDecisions 对齐：
 * boolean/字符串包装为 { decision, approver }；{ decision|approved } 覆写 approver；
 * { decisions: [...] } 逐条覆写；无 decision 标记的 payload（其他 interrupt 类型）原样保留。
 * 无认证用户（server-token 通道）时不盖章，保留原值。
 */
export function stampApproverIdentity(value: unknown, approver: string): unknown {
  const isDecisionShaped = (o: Record<string, unknown>): boolean =>
    typeof o.decision === 'string' || typeof o.approved === 'boolean'
  if (value == null) return value
  if (typeof value === 'boolean') return { decision: value ? 'approved' : 'rejected', approver }
  if (typeof value === 'string') return { decision: value === 'approved' ? 'approved' : 'rejected', approver }
  if (Array.isArray(value)) return value.map(v => stampApproverIdentity(v, approver))
  if (typeof value === 'object') {
    const src = value as Record<string, unknown>
    if (Array.isArray(src.decisions)) {
      return { ...src, decisions: src.decisions.map(v => stampApproverIdentity(v, approver)) }
    }
    if (isDecisionShaped(src)) return { ...src, approver }
    return value
  }
  return value
}

/** 台账⑥（P2）：GraphSpec 持久化切 event-log 同库 specs 表（重启可恢复）。
 *  filePath 降级为迁移兜底——表空时读一次 JSON 文件灌入表，之后以表为准；
 *  不传 eventLog 时维持 P1 内存/文件语义（既有 `new GraphSpecStore()` 调用方兼容）。 */
export class GraphSpecStore {
  private specs = new Map<string, GraphSpec>()

  constructor(private eventLog?: EventLogStore, private filePath?: string) {}

  async load(): Promise<void> {
    if (this.eventLog) {
      const rows = await this.eventLog.listSpecs()
      if (rows.length > 0) {
        for (const row of rows) {
          const got = await this.eventLog.getSpec(row.id)
          if (got) this.specs.set(got.id, got.spec as GraphSpec)
        }
        return
      }
      // 表空 → 读一次旧 JSON 文件灌入表（迁移兜底；此后表为准，文件不再回读）
      for (const spec of await this.readFileSpecs()) {
        this.specs.set(spec.id, spec)
        await this.eventLog.saveSpec({ id: spec.id, version: spec.version, spec })
      }
      return
    }
    for (const spec of await this.readFileSpecs()) this.specs.set(spec.id, spec)
  }

  private async readFileSpecs(): Promise<GraphSpec[]> {
    if (!this.filePath) return []
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8')
      const parsed = JSON.parse(raw) as GraphSpec[]
      return Array.isArray(parsed) ? parsed : []
    } catch {
      // 无文件/损坏 → 空表起步
      return []
    }
  }

  async save(spec: GraphSpec): Promise<void> {
    this.specs.set(spec.id, spec)
    if (this.eventLog) {
      await this.eventLog.saveSpec({ id: spec.id, version: spec.version, spec })
      return
    }
    if (this.filePath) {
      await fs.writeFile(this.filePath, JSON.stringify([...this.specs.values()], null, 2), 'utf-8')
    }
  }

  list(): GraphSpec[] {
    return [...this.specs.values()]
  }

  get(id: string): GraphSpec | undefined {
    return this.specs.get(id)
  }
}

export interface GraphRestDeps {
  graphService: GraphService
  eventLog: EventLogStore
  /** mode=on 时手动 tick 经 spawner（可选：legacy/shadow 下 runs 端点只读） */
  spawner?: RunSpawner | null
  specStore?: GraphSpecStore | null
}

export function createGraphRunRouter(deps: GraphRestDeps): Router {
  const router = new Router()

  // GET /api/graph/runs — 全部 run（含状态推导）
  router.get('/api/graph/runs', async (ctx) => {
    const runs = await deps.eventLog.listRuns()
    const body = runs.map(({ runId, graphId }) => {
      const rec = deps.graphService.getRun(runId)
      return {
        runId, graphId,
        status: rec?.instance.status ?? 'unknown',
        updatedAt: rec?.instance.updatedAt ?? null,
      }
    })
    ctx.body = { runs: body }
  })

  // GET /api/graph/runs/:id — 单 run 详情
  router.get('/api/graph/runs/:id', async (ctx) => {
    if (!ID_RE.test(ctx.params.id)) { ctx.status = 400; ctx.body = { error: 'Invalid run id' }; return }
    const rec = deps.graphService.getRun(ctx.params.id)
    if (!rec) { ctx.status = 404; ctx.body = { error: 'Run not found' }; return }
    ctx.body = { runId: ctx.params.id, graphId: rec.graphId, instance: rec.instance }
  })

  // POST /api/graph/runs/:id/resume — HITL 闭环：应答 interrupt
  router.post('/api/graph/runs/:id/resume', async (ctx) => {
    if (!ID_RE.test(ctx.params.id)) { ctx.status = 400; ctx.body = { error: 'Invalid run id' }; return }
    const body = ctx.request.body as { interruptId?: string; value?: unknown }
    if (!body?.interruptId || !ID_RE.test(body.interruptId) && !body.interruptId.includes(':')) {
      ctx.status = 400; ctx.body = { error: 'interruptId required' }; return
    }
    try {
      // 审批身份盖章：见 stampApproverIdentity 注释——决策者身份以认证主体为准
      const username = (ctx.state as { user?: { username?: string } }).user?.username
      const value = username !== undefined ? stampApproverIdentity(body.value, username) : body.value
      const instance = await deps.graphService.resumeRun(ctx.params.id, body.interruptId, value)
      ctx.body = { runId: ctx.params.id, instance }
    } catch (err) {
      ctx.status = 409
      ctx.body = { error: err instanceof Error ? err.message : String(err) }
    }
  })

  // POST /api/graph/runs/:id/fork — 从检查点分叉（LangGraph 模式）
  router.post('/api/graph/runs/:id/fork', async (ctx) => {
    if (!ID_RE.test(ctx.params.id)) { ctx.status = 400; ctx.body = { error: 'Invalid run id' }; return }
    const body = ctx.request.body as { superStep?: number } | undefined
    let superStep = body?.superStep
    if (superStep === undefined) {
      const cp = await deps.eventLog.getLatestCheckpoint(ctx.params.id)
      if (!cp) { ctx.status = 409; ctx.body = { error: 'No checkpoint to fork from' }; return }
      superStep = cp.superStep
    }
    try {
      const { runId } = await deps.graphService.forkRun(ctx.params.id, superStep)
      ctx.body = { runId, forkedFrom: ctx.params.id, superStep }
    } catch (err) {
      ctx.status = 409
      ctx.body = { error: err instanceof Error ? err.message : String(err) }
    }
  })

  // GET /api/graph/runs/:id/replay — 完整事件序列回放
  router.get('/api/graph/runs/:id/replay', async (ctx) => {
    if (!ID_RE.test(ctx.params.id)) { ctx.status = 400; ctx.body = { error: 'Invalid run id' }; return }
    try {
      const events = await deps.graphService.replayRun(ctx.params.id)
      ctx.body = { runId: ctx.params.id, events }
    } catch (err) {
      ctx.status = 404
      ctx.body = { error: err instanceof Error ? err.message : String(err) }
    }
  })

  // GET /api/graph/runs/:id/export — 运行导出包（P3 台账 #30，spec 门禁缺口）：
  // run 详情 + 图规格 + 全事件一次打包，Content-Disposition attachment 供直接下载。
  router.get('/api/graph/runs/:id/export', async (ctx) => {
    if (!ID_RE.test(ctx.params.id)) { ctx.status = 400; ctx.body = { error: 'Invalid run id' }; return }
    const rec = deps.graphService.getRun(ctx.params.id)
    if (!rec) { ctx.status = 404; ctx.body = { error: 'Run not found' }; return }
    const spec = deps.specStore?.get(rec.graphId) ?? null
    const events = await deps.eventLog.query(ctx.params.id)
    ctx.set('Content-Disposition', `attachment; filename=run-${ctx.params.id}.json`)
    ctx.type = 'application/json'
    ctx.body = { run: { runId: rec.runId, graphId: rec.graphId, instance: rec.instance }, spec, events }
  })

  // GET /api/graph/specs — 已注册图规格
  router.get('/api/graph/specs', async (ctx) => {
    ctx.body = { specs: deps.specStore?.list() ?? [] }
  })

  // GET /api/graph/specs/:id — 单图规格（P3 台账 #25：前端按 id 直取，不再列表端 client 侧 find）
  router.get('/api/graph/specs/:id', async (ctx) => {
    if (!ID_RE.test(ctx.params.id)) { ctx.status = 400; ctx.body = { error: 'Invalid spec id' }; return }
    if (!deps.specStore) { ctx.status = 501; ctx.body = { error: 'Spec store not configured' }; return }
    const spec = deps.specStore.get(ctx.params.id)
    if (!spec) { ctx.status = 404; ctx.body = { error: `Spec not found: ${ctx.params.id}` }; return }
    ctx.body = { id: spec.id, version: spec.version, spec }
  })

  // POST /api/graph/specs — 登记图规格（台账 i 持久化）
  router.post('/api/graph/specs', async (ctx) => {
    const spec = ctx.request.body as GraphSpec
    if (!spec || typeof spec.id !== 'string' || !Array.isArray(spec.nodes) || !Array.isArray(spec.edges)) {
      ctx.status = 400; ctx.body = { error: 'Invalid GraphSpec' }; return
    }
    if (!deps.specStore) { ctx.status = 501; ctx.body = { error: 'Spec store not configured' }; return }
    await deps.specStore.save(spec)
    ctx.body = { ok: true, id: spec.id }
  })

  // POST /api/graph/runs/:id/start — 消费 fork 产物显式起跑（P1 台账 a 显式语义的 REST 面）
  router.post('/api/graph/runs/:id/start', async (ctx) => {
    if (!ID_RE.test(ctx.params.id)) { ctx.status = 400; ctx.body = { error: 'Invalid run id' }; return }
    const rec = deps.graphService.getRun(ctx.params.id)
    if (!rec) { ctx.status = 404; ctx.body = { error: 'Run not found' }; return }
    try {
      const { instance } = await deps.graphService.startRun(rec.graphId, undefined, ctx.params.id)
      ctx.body = { runId: ctx.params.id, instance }
    } catch (err) {
      ctx.status = 409
      ctx.body = { error: err instanceof Error ? err.message : String(err) }
    }
  })

  return router
}

/**
 * 审批桥接（断链修复的 REST 面）：旧 POST /api/loop/contracts/:id/approve 的内部实现——
 * 契约 id → 事件日志里 pendingInterrupt `approval:<contractId>` → resumeRun。
 * approver：REST 层从认证主体注入的用户名（缺省保持旧行为，decision 原样透传）。
 */
export async function resumeApprovalForContract(
  deps: { graphService: GraphService; eventLog: EventLogStore },
  contractId: string,
  decision: 'approved' | 'rejected' | 'changes-requested',
  approver?: string,
): Promise<{ ok: boolean; runId?: string }> {
  if (!ID_RE.test(contractId) && !contractId.includes('/')) return { ok: false }
  const prefix = `approval:${contractId}` // phase-nodes 新版 id 带 attempts 后缀（approval:<id>@<n>）
  const runs = await deps.eventLog.listRuns()
  for (const { runId } of runs) {
    const cp = await deps.eventLog.getLatestCheckpoint(runId)
    if (!cp) continue
    const hit = cp.pendingInterrupts.find(i => i.id === prefix || i.id.startsWith(`${prefix}@`))
    if (hit) {
      await deps.graphService.resumeRun(runId, hit.id, approver ? { decision, approver } : decision)
      return { ok: true, runId }
    }
  }
  return { ok: false }
}

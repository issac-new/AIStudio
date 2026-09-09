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

/** 台账 i：GraphSpec 持久化。P1 用 JSON 文件（.loop/graph-specs.json）——零新依赖、
 *  重启可恢复；sqlite 表化与 event-log 共库留 P2（REST 形状先立）。 */
export class GraphSpecStore {
  private specs = new Map<string, GraphSpec>()

  constructor(private filePath?: string) {}

  async load(): Promise<void> {
    if (!this.filePath) return
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8')
      const parsed = JSON.parse(raw) as GraphSpec[]
      for (const spec of parsed) this.specs.set(spec.id, spec)
    } catch {
      // 无文件/损坏 → 空表起步
    }
  }

  async save(spec: GraphSpec): Promise<void> {
    this.specs.set(spec.id, spec)
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
      const instance = await deps.graphService.resumeRun(ctx.params.id, body.interruptId, body.value)
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

  // GET /api/graph/specs — 已注册图规格
  router.get('/api/graph/specs', async (ctx) => {
    ctx.body = { specs: deps.specStore?.list() ?? [] }
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
 */
export async function resumeApprovalForContract(
  deps: { graphService: GraphService; eventLog: EventLogStore },
  contractId: string,
  decision: 'approved' | 'rejected' | 'changes-requested',
): Promise<{ ok: boolean; runId?: string }> {
  if (!ID_RE.test(contractId) && !contractId.includes('/')) return { ok: false }
  const interruptId = `approval:${contractId}`
  const runs = await deps.eventLog.listRuns()
  for (const { runId } of runs) {
    const cp = await deps.eventLog.getLatestCheckpoint(runId)
    if (!cp) continue
    if (cp.pendingInterrupts.some(i => i.id === interruptId)) {
      await deps.graphService.resumeRun(runId, interruptId, decision)
      return { ok: true, runId }
    }
  }
  return { ok: false }
}

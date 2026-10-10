/**
 * 本体工作台 REST（/api/hermes/ontology/*，GB/T 48000.3 方法论产品化）。
 *
 * GET  /spec               本体正本 + 统计 + 最近全量校验健康度
 * PUT  /spec               保存（validateSpec error=0 才落盘；版本+1+快照）
 * GET  /instances?type=    实例列表（可按类型过滤）
 * POST /instances          新增实例（写入即校验：error 拒写 422）
 * PUT  /instances/:id      替换实例（同上）
 * DELETE /instances/:id    删除（悬空关系由下轮跑批呈现）
 * POST /validate           全量跑批；body.instances 临时校验不入库
 * GET  /export?format=     jsonld | shacl | turtle
 * GET  /versions           spec 快照版本列表（ts 降序）
 * POST /rollback           回滚（body.ts；回滚前另存 pre-rollback 可再回）
 * POST /seed               重置为种子本体（super_admin 闸）
 *
 * 写面（PUT spec / DELETE instance / rollback / seed）与 kg-evolution 管理维护
 * 端点同闸：super_admin 或无鉴权上下文（本地 dev）可操作，其余 403。
 * 挂载：patch 590 在 bootstrap/routes.ts（import + app.use 两 hunk，582 同款范式）。
 */
import Router from '@koa/router'
import { specStats, type OntologyInstance, type OntologySpec, type Violation } from './ontology-types'
import { violationSummary } from './ontology-validate'
import {
  deleteInstance, listSpecSnapshots, loadInstances, loadSpec, resetToSeed, rollbackSpec, saveSpec, upsertInstance,
} from './ontology-store'
import { ingestFromKanban, kanbanSourceOverview } from './ontology-ingest'
import { exportOntology, type ExportFormat } from './ontology-export'
import { validateInstances, validateSpec } from './ontology-validate'

const router = new Router({ prefix: '/api/hermes/ontology' })

/** 写闸（kg-evolution-controller superAdminDenied 同语义）。 */
function superAdminDenied(ctx: { state?: unknown; status: number; body: unknown }): boolean {
  const user = (ctx.state as { user?: { role?: string } | undefined } | undefined)?.user
  if (!user || user.role === 'super_admin') return false
  ctx.status = 403
  ctx.body = { ok: false, error: '管理维护端点仅 super_admin 可操作' }
  return true
}

function asSpec(raw: unknown): OntologySpec | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Partial<OntologySpec>
  if (typeof s.namespace !== 'string' || !Array.isArray(s.entityTypes) || !Array.isArray(s.objectProperties) || !Array.isArray(s.axioms)) return null
  return s as OntologySpec
}

function asInstance(raw: unknown): OntologyInstance | null {
  if (!raw || typeof raw !== 'object') return null
  const i = raw as Partial<OntologyInstance>
  if (typeof i.id !== 'string' || !i.id || typeof i.type !== 'string' || typeof i.label !== 'string') return null
  return { ...i, data: i.data ?? {}, relations: i.relations ?? [] } as OntologyInstance
}

router.get('/spec', (ctx) => {
  const spec = loadSpec()
  const instances = loadInstances()
  const summary = violationSummary(validateInstances(spec, instances))
  ctx.body = { ok: true, spec, stats: specStats(spec, instances.length), health: summary }
})

router.put('/spec', (ctx) => {
  if (superAdminDenied(ctx)) return
  const next = asSpec(ctx.request.body)
  if (!next) {
    ctx.status = 400
    ctx.body = { ok: false, detail: 'spec 结构不完整（须含 namespace/entityTypes/objectProperties/axioms）' }
    return
  }
  const r = saveSpec(next, (ctx.state as { user?: { username?: string } } | undefined)?.user?.username)
  if (!r.ok) {
    ctx.status = 422
    ctx.body = { ok: false, detail: '本体自检未通过（error 级违规拒写——模式层也有数据契约）', violations: r.violations }
    return
  }
  ctx.body = { ok: true, spec: r.spec, snapshot: r.snapshot }
})

router.get('/instances', (ctx) => {
  const type = typeof ctx.query.type === 'string' && ctx.query.type ? ctx.query.type : ''
  const all = loadInstances()
  ctx.body = { ok: true, instances: type ? all.filter((i) => i.type === type) : all, total: all.length }
})

router.post('/instances', (ctx) => {
  const inst = asInstance(ctx.request.body)
  if (!inst) {
    ctx.status = 400
    ctx.body = { ok: false, detail: '实例结构不完整（须含 id/type/label）' }
    return
  }
  const r = upsertInstance(inst)
  if (!r.ok) {
    ctx.status = 422
    ctx.body = { ok: false, detail: '写入即校验未通过（error 级违规——数据契约是事前准入，不是事后说明）', violations: r.violations }
    return
  }
  ctx.body = { ok: true, saved: r.saved, violations: r.violations.filter((v) => v.severity !== 'error') }
})

router.put('/instances/:id', (ctx) => {
  if (superAdminDenied(ctx)) return
  const id = ctx.params.id
  const inst = asInstance(ctx.request.body)
  if (!inst || inst.id !== id) {
    ctx.status = 400
    ctx.body = { ok: false, detail: `body.id 须与路径 :id 一致（${id}）` }
    return
  }
  const r = upsertInstance(inst, id)
  if (!r.ok) {
    ctx.status = 422
    ctx.body = { ok: false, detail: '写入即校验未通过（error 级违规拒写）', violations: r.violations }
    return
  }
  ctx.body = { ok: true, saved: r.saved, violations: r.violations.filter((v) => v.severity !== 'error') }
})

router.delete('/instances/:id', (ctx) => {
  if (superAdminDenied(ctx)) return
  const ok = deleteInstance(ctx.params.id)
  if (!ok) {
    ctx.status = 404
    ctx.body = { ok: false, detail: `实例不存在：${ctx.params.id}` }
    return
  }
  ctx.body = { ok: true }
})

router.post('/validate', (ctx) => {
  const spec = loadSpec()
  const body = (ctx.request.body ?? {}) as { instances?: unknown }
  if (Array.isArray(body.instances)) {
    const insts = body.instances.map(asInstance).filter((x): x is OntologyInstance => x !== null)
    const violations = validateInstances(spec, insts)
    ctx.body = { ok: true, persisted: false, count: insts.length, violations, summary: violationSummary(violations) }
    return
  }
  const instances = loadInstances()
  const violations: Violation[] = [...validateSpec(spec), ...validateInstances(spec, instances)]
  ctx.body = { ok: true, persisted: true, count: instances.length, violations, summary: violationSummary(violations) }
})

router.get('/export', (ctx) => {
  const fmt = String(ctx.query.format ?? 'jsonld') as ExportFormat
  if (fmt !== 'jsonld' && fmt !== 'shacl' && fmt !== 'turtle') {
    ctx.status = 400
    ctx.body = { ok: false, detail: 'format 须为 jsonld | shacl | turtle' }
    return
  }
  const { body, contentType } = exportOntology(loadSpec(), loadInstances(), fmt)
  ctx.set('Content-Type', contentType)
  ctx.body = body
})

router.get('/versions', (ctx) => {
  ctx.body = { ok: true, versions: listSpecSnapshots() }
})

router.post('/rollback', (ctx) => {
  if (superAdminDenied(ctx)) return
  const body = (ctx.request.body ?? {}) as { ts?: unknown }
  const ts = Number(body.ts)
  if (!Number.isFinite(ts) || ts <= 0) {
    ctx.status = 400
    ctx.body = { ok: false, detail: 'ts 必填（快照 unix 毫秒，见 GET /versions）' }
    return
  }
  const r = rollbackSpec(ts)
  if (!r.ok) {
    ctx.status = 404
    ctx.body = { ok: false, detail: r.error }
    return
  }
  ctx.body = { ok: true, ts, preRollback: r.preRollback, restoredVersion: r.restoredVersion }
})

router.post('/seed', (ctx) => {
  if (superAdminDenied(ctx)) return
  const r = resetToSeed()
  ctx.body = { ok: true, snapshot: r.snapshot, spec: r.spec, instanceCount: r.instances.length }
})

// ---- 摄取面（kanban → 本体；让本体吃真实数据而非手工字典） ----

/** 看板数据源概览（不读任务体）。 */
router.get('/kanban-overview', (ctx) => {
  ctx.body = { ok: true, sources: kanbanSourceOverview() }
})

/** 摄取：body.board 指定单板，缺省全板。替换语义（kb: 前缀批），幂等可重跑。 */
router.post('/ingest', async (ctx) => {
  if (superAdminDenied(ctx)) return
  const body = (ctx.request.body ?? {}) as { board?: unknown }
  const board = typeof body.board === 'string' && body.board ? body.board : undefined
  try {
    const r = await ingestFromKanban(board ? { board } : undefined)
    ctx.body = { ok: r.ok, ingest: r }
  } catch (e) {
    ctx.status = 500
    ctx.body = { ok: false, detail: `摄取失败：${e instanceof Error ? e.message : String(e)}` }
  }
})

export const ontologyRoutes = router

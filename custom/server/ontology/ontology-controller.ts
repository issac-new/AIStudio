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
 * GET  /fibo               FIBO 对齐包（真实 IRI/定义/模块版本）+ 当前已导入数
 * POST /fibo/import        增量导入 FIBO 包（super_admin 闸；冲突整批不写）
 * GET  /fibo/related-docs  术语→关联 spec 文档（JoyAI 闭环吸收轮 P3，读侧投影）
 *
 * 写面（PUT spec / DELETE instance / rollback / seed / fibo import）与
 * kg-evolution 管理维护端点同闸：super_admin 或无鉴权上下文（本地 dev）可操作，
 * 其余 403。
 * 挂载：patch 590 在 bootstrap/routes.ts（import + app.use 两 hunk，582 同款范式）。
 */
import Router from '@koa/router'
import type { Context } from 'koa'
import { specStats, type OntologyInstance, type OntologySpec, type Violation } from './ontology-types'
import { violationSummary } from './ontology-validate'
import {
  deleteInstance, listSpecSnapshots, loadInstances, loadSpec, resetToSeed, rollbackSpec, saveSpec, upsertInstance,
} from './ontology-store'
import { fiboPackApplied, fiboPackSummary, mergeFiboPack } from './ontology-fibo'
import { fiboGlossary } from './ontology-fibo-glossary'
import { listSpecDocs, scanTermsInSpecs } from '../specs/specs-index'
import { ingestFiboDemo } from './ontology-fibo-instances'
import { fiboOpsSnapshot } from './ontology-fibo-ops'
import { redactInstancesForRole } from './ontology-field-policy'
import { ingestFromKanban, kanbanSourceOverview } from './ontology-ingest'
import { ensureOntologyWatcher, ingestSingleTask, startOntologyWatchIfEnabled } from './ontology-watch'
import { registerOntologyAgentBridgeRoutes } from './ontology-agent-bridge'

// 轮询环启动入口转发（routes.ts 挂载点 import 自本控制器——单一挂载面，582 先例）
export { startOntologyWatchIfEnabled } from './ontology-watch'
// agent 桥注册转发（公开段挂载——cron-bridge 同款；validatorExec 的无鉴权通道）
export { registerOntologyAgentBridgeRoutes } from './ontology-agent-bridge'
import { exportOntology, type ExportFormat } from './ontology-export'
import { validateInstances, validateSpec } from './ontology-validate'
import { fail } from '../lib/http'

const router = new Router({ prefix: '/api/hermes/ontology' })

/** 写闸（kg-evolution-controller superAdminDenied 同语义）。 */
function superAdminDenied(ctx: Context): boolean {
  const user = (ctx.state as { user?: { role?: string } | undefined } | undefined)?.user
  if (!user || user.role === 'super_admin') return false
  fail(ctx, 403, '管理维护端点仅 super_admin 可操作')
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
    fail(ctx, 400, 'spec 结构不完整（须含 namespace/entityTypes/objectProperties/axioms）', { extra: { detail: 'spec 结构不完整（须含 namespace/entityTypes/objectProperties/axioms）' } })
    return
  }
  const r = saveSpec(next, (ctx.state as { user?: { username?: string } } | undefined)?.user?.username)
  if (!r.ok) {
    fail(ctx, 422, '本体自检未通过（error 级违规拒写——模式层也有数据契约）', {
      extra: { detail: '本体自检未通过（error 级违规拒写——模式层也有数据契约）', violations: r.violations },
    })
    return
  }
  ctx.body = { ok: true, spec: r.spec, snapshot: r.snapshot }
})

router.get('/instances', (ctx) => {
  const type = typeof ctx.query.type === 'string' && ctx.query.type ? ctx.query.type : ''
  const all = loadInstances()
  // P3-2 字段级脱敏试点：Account.accountNumber / Payer.partyRef 仅管理角色可见。
  const role = (ctx.state as { user?: { role?: string } } | undefined)?.user?.role
  const filtered = type ? all.filter((i) => i.type === type) : all
  const { instances: visible, redacted, fields } = redactInstancesForRole(filtered, role)
  ctx.body = {
    ok: true,
    instances: visible,
    total: all.length,
    redacted,
    redactedFields: fields,
  }
})

router.post('/instances', (ctx) => {
  const inst = asInstance(ctx.request.body)
  if (!inst) {
    fail(ctx, 400, '实例结构不完整（须含 id/type/label）', { extra: { detail: '实例结构不完整（须含 id/type/label）' } })
    return
  }
  const r = upsertInstance(inst)
  if (!r.ok) {
    fail(ctx, 422, '写入即校验未通过（error 级违规——数据契约是事前准入，不是事后说明）', {
      extra: { detail: '写入即校验未通过（error 级违规——数据契约是事前准入，不是事后说明）', violations: r.violations },
    })
    return
  }
  ctx.body = { ok: true, saved: r.saved, violations: r.violations.filter((v) => v.severity !== 'error') }
})

router.put('/instances/:id', (ctx) => {
  if (superAdminDenied(ctx)) return
  const id = ctx.params.id
  const inst = asInstance(ctx.request.body)
  if (!inst || inst.id !== id) {
    fail(ctx, 400, `body.id 须与路径 :id 一致（${id}）`, { extra: { detail: `body.id 须与路径 :id 一致（${id}）` } })
    return
  }
  const r = upsertInstance(inst, id)
  if (!r.ok) {
    fail(ctx, 422, '写入即校验未通过（error 级违规拒写）', { extra: { detail: '写入即校验未通过（error 级违规拒写）', violations: r.violations } })
    return
  }
  ctx.body = { ok: true, saved: r.saved, violations: r.violations.filter((v) => v.severity !== 'error') }
})

router.delete('/instances/:id', (ctx) => {
  if (superAdminDenied(ctx)) return
  const ok = deleteInstance(ctx.params.id)
  if (!ok) {
    fail(ctx, 404, `实例不存在：${ctx.params.id}`, { extra: { detail: `实例不存在：${ctx.params.id}` } })
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
    fail(ctx, 400, 'format 须为 jsonld | shacl | turtle', { extra: { detail: 'format 须为 jsonld | shacl | turtle' } })
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
    fail(ctx, 400, 'ts 必填（快照 unix 毫秒，见 GET /versions）', { extra: { detail: 'ts 必填（快照 unix 毫秒，见 GET /versions）' } })
    return
  }
  const r = rollbackSpec(ts)
  if (!r.ok) {
    const reason = r.error ?? '快照回滚失败'
    fail(ctx, 404, reason, { extra: { detail: reason } })
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
    const detail = `摄取失败：${e instanceof Error ? e.message : String(e)}`
    fail(ctx, 500, detail, { extra: { detail } })
  }
})

// ---- 结卡校验面（四阶段三路线） ----

/** 单任务增量摄取+校验（毫秒级；agent 面 validatorExec 校验器与调试共用）。 */
router.post('/validate-task', async (ctx) => {
  const body = (ctx.request.body ?? {}) as { board?: unknown; taskId?: unknown }
  const board = typeof body.board === 'string' && body.board ? body.board : 'main'
  const taskId = typeof body.taskId === 'string' && body.taskId ? body.taskId : ''
  if (!taskId) {
    fail(ctx, 400, 'taskId 必填；board 缺省 main', { extra: { detail: 'taskId 必填；board 缺省 main' } })
    return
  }
  const r = await ingestSingleTask(board, taskId)
  ctx.body = {
    ok: r.ok, found: r.found, written: r.written,
    violations: r.violations,
    /** rc 形态（validatorExec 消费：0=过；1=违规；2=任务缺席——缺席不算违规） */
    rc: r.ok ? 0 : 1,
  }
})

/** 轮询环状态 + 手动兜底推进（force 绕节流立即跑一轮）。 */
router.get('/watch/status', (ctx) => {
  const w = ensureOntologyWatcher()
  ctx.body = {
    ok: true,
    watch: {
      enabled: process.env.ONTOLOGY_WATCH !== 'off',
      intervalMs: Number(process.env.ONTOLOGY_WATCH_INTERVAL_MS ?? 30_000),
      lastTick: w.lastTick,
    },
  }
})

router.post('/watch/tick', async (ctx) => {
  if (superAdminDenied(ctx)) return
  const r = await ensureOntologyWatcher().runOnce()
  ctx.body = { ok: !r.error, tick: r }
})

// ---- FIBO 对齐包（2026-10-21 深调研；真实 IRI + 逐模块版本锚） ----

/** 包目录（只读）：概念/属性/模块版本/成熟度 + 当前 spec 已导入数。 */
router.get('/fibo', (ctx) => {
  const spec = loadSpec()
  ctx.body = { ok: true, pack: fiboPackSummary(), applied: fiboPackApplied(spec) }
})

/**
 * 术语→关联文档（JoyAI 闭环吸收轮 P3，2026-10-26）：ZERO「术语→关联全量文档」
 * 的读侧投影——FIBO 概念（中文名/英文名/别名）× docs/superpowers/specs 全文提及
 * 扫描。纯计算不落盘（glossary 数据结构与版本快照不动）；specs 索引由
 * specs-index 模块承载（mtime 缓存）。?conceptId= 单概念过滤。
 * 每概念命中封顶 8 份（新优先），泛化别名刷屏有界；specs 目录缺席=空清单
 * （fail-soft，不阻断 fibo 面其他读数）。
 */
router.get('/fibo/related-docs', (ctx) => {
  const conceptId = typeof ctx.query.conceptId === 'string' && ctx.query.conceptId ? ctx.query.conceptId : ''
  const entries = conceptId ? fiboGlossary().entries.filter((e) => e.id === conceptId) : fiboGlossary().entries
  const related = []
  for (const e of entries) {
    const terms = [e.labelZh, e.label, ...e.aliases].filter((t) => typeof t === 'string' && t.trim())
    // 多术语批扫：同一文档多形态命中（支付/Payment）只计一次，命中形态取首个
    const byFile = new Map<string, { file: string; title: string; date: string | null; matchedLine: string; term: string }>()
    for (const hit of scanTermsInSpecs(terms)) {
      if (!byFile.has(hit.file)) byFile.set(hit.file, { file: hit.file, title: hit.title, date: hit.date, matchedLine: hit.matchedLine, term: hit.term })
    }
    const docs = [...byFile.values()].sort((a, b) => b.file.localeCompare(a.file)).slice(0, 8)
    if (docs.length) related.push({ conceptId: e.id, label: e.labelZh, docs })
  }
  ctx.body = { ok: true, specsScanned: listSpecDocs().length, total: related.length, related }
})

/**
 * 增量导入：只追加缺失项，已有同 id 同 IRI 幂等跳过；同 id 不同 IRI 整批 409。
 * 落盘走 saveSpec（validateSpec error=0 才写、版本+1、pre-save 快照可回滚）。
 * 实例不受影响——导入只扩 T-Box，不重写 A-Box。
 */
router.post('/fibo/import', (ctx) => {
  if (superAdminDenied(ctx)) return
  const current = loadSpec()
  const merged = mergeFiboPack(current)
  if (!merged.ok || !merged.spec) {
    fail(ctx, 409, 'FIBO 导入冲突：本地已有同 id 但 IRI 不同的术语，整批未写入（不做静默覆盖）', {
      extra: {
        detail: 'FIBO 导入冲突：本地已有同 id 但 IRI 不同的术语，整批未写入（不做静默覆盖）',
        collisions: merged.collisions,
        added: merged.added,
        skipped: merged.skipped,
      },
    })
    return
  }
  const r = saveSpec(merged.spec, (ctx.state as { user?: { username?: string } } | undefined)?.user?.username)
  if (!r.ok || !r.spec) {
    fail(ctx, 422, 'FIBO 包合并后本体自检未通过（error 级违规拒写）', {
      extra: {
        detail: 'FIBO 包合并后本体自检未通过（error 级违规拒写）',
        violations: r.violations,
        added: merged.added,
        skipped: merged.skipped,
      },
    })
    return
  }
  ctx.body = {
    ok: true,
    added: merged.added,
    skipped: merged.skipped,
    applied: fiboPackApplied(r.spec),
    spec: r.spec,
    snapshot: r.snapshot,
    violations: r.violations.filter((v) => v.severity !== 'error'),
  }
})

/** 运营快照（只读）：报告证据、术语表/映射/域目录计数、版本锁、门禁与脱敏试点。 */
router.get('/fibo/ops', (ctx) => {
  ctx.body = { ok: true, ops: fiboOpsSnapshot(loadSpec(), loadInstances()) }
})

/**
 * 支付样例实例摄取：未导入包则先增量导入；批次全量校验 error=0 才按 `fibo:`
 * 前缀替换写入。重复执行幂等；error 整批不写（不写半套）。
 */
router.post('/fibo/ingest-demo', (ctx) => {
  if (superAdminDenied(ctx)) return
  const r = ingestFiboDemo()
  if (!r.ok) {
    const detail = r.detail ?? '支付样例未写入'
    fail(ctx, 422, detail, { extra: { ...r, detail } })
    return
  }
  ctx.body = { ...r, ok: true }
})

export const ontologyRoutes = router

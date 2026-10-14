/**
 * 流程架构域端点（bpa）：
 *   GET  /api/bpa/architecture   全树+配置+体检报告（首屏一拉全量）
 *   PUT  /api/bpa/node           upsert 节点（结构完整性写入点强制）
 *   DELETE /api/bpa/node/:id     级联删除（子孙+引用清理）
 *   PUT  /api/bpa/config         治理参数（构图法切换联动分区集）
 *   POST /api/bpa/validate       立即体检
 *   POST /api/bpa/seed           载入示例架构（覆盖写，需 confirm=true）
 *   GET/POST /api/bpa/maturity   PEMM 成熟度：历史 / 提交自评
 */
import Router from '@koa/router'
import type { Context } from 'koa'
import type { BpaConfig, BpaFramework, BpaNode, PemmAssessment, PemmFactorKey } from './bpa-types'
import { BPA_FRAMEWORK_SECTIONS, BPA_DEFAULT_CONFIG, PEMM_FACTORS } from './bpa-types'
import {
  architectureFile, readArchitecture, writeArchitecture, upsertNode, deleteNodeCascade,
  BpaUpsertError, readMaturityHistory, appendMaturity, pemmOverall,
} from './bpa-store'
import { validateArchitecture } from './bpa-validate'
import { seedArchitecture } from './bpa-seed'

const router = new Router({ prefix: '/api/bpa' })

function snapshot(): { config: BpaConfig; nodes: BpaNode[]; updatedAt: number; report: ReturnType<typeof validateArchitecture>; store: string } {
  const arch = readArchitecture()
  return { config: arch.config, nodes: arch.nodes, updatedAt: arch.updatedAt, report: validateArchitecture(arch), store: architectureFile() }
}

router.get('/architecture', async (ctx: Context) => {
  ctx.body = { ok: true, ...snapshot() }
})

router.put('/node', async (ctx: Context) => {
  const body = (ctx.request.body ?? {}) as { node?: BpaNode }
  if (!body.node || typeof body.node !== 'object' || typeof body.node.id !== 'string') {
    ctx.status = 400
    ctx.body = { ok: false, problems: ['node 必填（含 id/level/parentId）'] }
    return
  }
  const arch = readArchitecture()
  try {
    upsertNode(arch, body.node)
  } catch (err) {
    const status = err instanceof BpaUpsertError ? 400 : 500
    ctx.status = status
    ctx.body = { ok: false, problems: [err instanceof Error ? err.message : String(err)] }
    return
  }
  writeArchitecture(arch.nodes, arch.config)
  ctx.body = { ok: true, ...snapshot() }
})

router.delete('/node/:id', async (ctx: Context) => {
  const id = ctx.params.id
  const arch = readArchitecture()
  const removed = deleteNodeCascade(arch, id)
  if (removed.length === 0) {
    ctx.status = 404
    ctx.body = { ok: false, problems: [`节点 ${id} 不存在`] }
    return
  }
  writeArchitecture(arch.nodes, arch.config)
  ctx.body = { ok: true, removed, ...snapshot() }
})

router.put('/config', async (ctx: Context) => {
  const body = (ctx.request.body ?? {}) as Partial<BpaConfig> & { framework?: BpaFramework }
  const arch = readArchitecture()
  const next: BpaConfig = { ...arch.config, ...body }
  if (next.framework && BPA_FRAMEWORK_SECTIONS[next.framework]) {
    next.mapSections = BPA_FRAMEWORK_SECTIONS[next.framework] // 构图法切换 → 分区集联动
  } else {
    next.framework = BPA_DEFAULT_CONFIG.framework
  }
  if (!Array.isArray(next.mapSections) || next.mapSections.length === 0) {
    next.mapSections = BPA_FRAMEWORK_SECTIONS[next.framework]
  }
  next.maxDepth = Math.min(6, Math.max(1, Number(next.maxDepth) || 6))
  next.reviewCycleDays = Math.min(3650, Math.max(7, Number(next.reviewCycleDays) || 180))
  writeArchitecture(arch.nodes, next)
  ctx.body = { ok: true, ...snapshot() }
})

router.post('/validate', async (ctx: Context) => {
  const arch = readArchitecture()
  ctx.body = { ok: true, report: validateArchitecture(arch) }
})

router.post('/seed', async (ctx: Context) => {
  const body = (ctx.request.body ?? {}) as { confirm?: boolean }
  if (body.confirm !== true) {
    ctx.status = 400
    ctx.body = { ok: false, problems: ['载入示例将覆盖现有架构——confirm=true 才执行（先导出现有清单再覆盖是安全习惯）'] }
    return
  }
  const seeded = seedArchitecture()
  writeArchitecture(seeded.nodes, seeded.config)
  ctx.body = { ok: true, seeded: seeded.nodes.length, ...snapshot() }
})

// ---------- PEMM 成熟度 ----------

router.get('/maturity', async (ctx: Context) => {
  ctx.body = { ok: true, history: readMaturityHistory() }
})

router.post('/maturity', async (ctx: Context) => {
  const body = (ctx.request.body ?? {}) as { scores?: Record<string, unknown>; note?: string }
  if (!body.scores || typeof body.scores !== 'object') {
    ctx.status = 400
    ctx.body = { ok: false, problems: ['scores 必填（P0-P4 各因素分值 0-4）'] }
    return
  }
  const validKeys = new Set(PEMM_FACTORS.map((f) => f.key as string))
  const scores: Partial<Record<PemmFactorKey, number>> = {}
  for (const [k, v] of Object.entries(body.scores)) {
    if (!validKeys.has(k)) continue
    const n = Number(v)
    if (Number.isInteger(n) && n >= 0 && n <= 4) scores[k as PemmFactorKey] = n
  }
  if (Object.keys(scores).length === 0) {
    ctx.status = 400
    ctx.body = { ok: false, problems: ['无有效分值（需 0-4 整数，因素键见 PEMM_FACTORS）'] }
    return
  }
  const entry: PemmAssessment = {
    id: `pemm-${Date.now().toString(36)}`,
    scoredAt: Date.now(),
    scores,
    ...(typeof body.note === 'string' && body.note.trim() ? { note: body.note.trim().slice(0, 500) } : {}),
  }
  const history = appendMaturity(entry)
  ctx.body = { ok: true, entry, overall: pemmOverall(scores), history }
})

export default router

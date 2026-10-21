/**
 * 本体 agent 桥（公开段，cron-bridge 同款安全形态）——2026-10-10 四阶段路线二配套。
 *
 * 动机：validatorExec 门在 agent（kanban 结卡事务）里执行，调 studio 的
 * /validate-task 端点在鉴权段内（401 fail-open，工具形同虚设）。照 cron-bridge
 * 先例把该端点的 agent 版挂到公开段：
 *   POST /api/ontology/agent-bridge/validate-task   （body: board, taskId）
 * 2026-10-21 FIBO 产品落地：新增只读术语查询（同一回环/令牌闸）：
 *   GET  /api/ontology/agent-bridge/fibo?q=Payment
 *   - 无 q：返回 FIBO 包覆盖度（总数/已导入/来源分档/发布版本）。
 *   - 有 q：返回命中的概念（真实 IRI/定义/模块版本/是否已导入）。
 *   供 agent、报告生成器、外部脚本按词查语义，不必读工作台源码。
 * 安全姿态（如实登记）：
 *   - 来源限本机回环（agent 与 studio 同主机同用户运行——该进程本就能直读写
 *     ONTOLOGY_DIR 与 kanban 库文件，桥不引入新的攻击面）；
 *   - ONTOLOGY_BRIDGE_TOKEN 设立即启用 token 校验（fail-closed：设了不匹配 401）；
 *     缺省不强制——回环限制已是本机同信任域。
 * 行为与鉴权段 /api/hermes/ontology/validate-task 完全同芯（同一 ingestSingleTask）。
 */
import type { Context, Next } from 'koa'
import { fiboPackApplied, fiboPackSummary } from './ontology-fibo'
import { fiboDomains } from './ontology-fibo-domains'
import { fiboEvidence } from './ontology-fibo-evidence'
import { fiboGlossary } from './ontology-fibo-glossary'
import { fiboMappings } from './ontology-fibo-mapping'
import { fiboOpsSnapshot } from './ontology-fibo-ops'
import { loadInstances, loadSpec } from './ontology-store'
import { ingestSingleTask } from './ontology-watch'

export const ONTOLOGY_AGENT_BRIDGE_PATH = '/api/ontology/agent-bridge/validate-task'
export const ONTOLOGY_AGENT_BRIDGE_FIBO_PATH = '/api/ontology/agent-bridge/fibo'
export const ONTOLOGY_AGENT_BRIDGE_FIBO_EVIDENCE_PATH = `${ONTOLOGY_AGENT_BRIDGE_FIBO_PATH}/evidence`
export const ONTOLOGY_AGENT_BRIDGE_FIBO_GLOSSARY_PATH = `${ONTOLOGY_AGENT_BRIDGE_FIBO_PATH}/glossary`
export const ONTOLOGY_AGENT_BRIDGE_FIBO_MAPPINGS_PATH = `${ONTOLOGY_AGENT_BRIDGE_FIBO_PATH}/mappings`
export const ONTOLOGY_AGENT_BRIDGE_FIBO_DOMAINS_PATH = `${ONTOLOGY_AGENT_BRIDGE_FIBO_PATH}/domains`
export const ONTOLOGY_AGENT_BRIDGE_FIBO_OPS_PATH = `${ONTOLOGY_AGENT_BRIDGE_FIBO_PATH}/ops`

function isLoopback(ip: string | undefined): boolean {
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip === undefined
}

/** 回环 + 可选令牌闸；返回 false 时已写好 403/401 响应。 */
function bridgeGuard(ctx: Context, env: Record<string, string | undefined>): boolean {
  if (!isLoopback(ctx.ip)) {
    ctx.status = 403
    ctx.body = { ok: false, error: 'loopback only' }
    return false
  }
  const token = env.ONTOLOGY_BRIDGE_TOKEN?.trim()
  if (token && ctx.get('x-ontology-bridge-token') !== token) {
    ctx.status = 401
    ctx.body = { ok: false, error: 'bad bridge token' }
    return false
  }
  return true
}

export function registerOntologyAgentBridgeRoutes(app: {
  use: (mw: (ctx: Context, next: Next) => Promise<void>) => void
}, env: Record<string, string | undefined> = process.env): void {
  app.use(async (ctx, next) => {
    if (ctx.method !== 'POST' || ctx.path !== ONTOLOGY_AGENT_BRIDGE_PATH) return next()
    if (!bridgeGuard(ctx, env)) return
    const body = ((ctx.request as { body?: unknown }).body ?? {}) as { board?: unknown; taskId?: unknown }
    const board = typeof body.board === 'string' && body.board ? body.board : 'main'
    const taskId = typeof body.taskId === 'string' && body.taskId ? body.taskId : ''
    if (!taskId) {
      ctx.status = 400
      ctx.body = { ok: false, detail: 'taskId 必填；board 缺省 main' }
      return
    }
    const r = await ingestSingleTask(board, taskId)
    ctx.body = {
      ok: r.ok, found: r.found, written: r.written, violations: r.violations,
      rc: r.ok ? 0 : 1,
    }
  })

  // FIBO 只读面：术语查询、报告证据、术语表、数据源映射、域目录、运营快照。
  app.use(async (ctx, next) => {
    if (ctx.method !== 'GET') return next()
    if (ctx.path !== ONTOLOGY_AGENT_BRIDGE_FIBO_PATH && !ctx.path.startsWith(`${ONTOLOGY_AGENT_BRIDGE_FIBO_PATH}/`)) return next()
    if (!bridgeGuard(ctx, env)) return
    const spec = loadSpec()
    const instances = loadInstances()
    switch (ctx.path) {
      case ONTOLOGY_AGENT_BRIDGE_FIBO_PATH: {
        const raw = ctx.query.q ?? ctx.query.term
        const q = typeof raw === 'string' ? raw.trim() : ''
        const pack = fiboPackSummary()
        const applied = fiboPackApplied(spec)
        const appliedIds = new Set(applied.applied)
        const hits = q
          ? pack.concepts
            .filter((c) => `${c.id} ${c.label} ${c.labelZh} ${c.iri}`.toLowerCase().includes(q.toLowerCase()))
            .slice(0, 10)
            .map((c) => ({ ...c, applied: appliedIds.has(c.id) }))
          : []
        ctx.body = {
          ok: true,
          source: pack.source,
          coverage: {
            concepts: pack.counts.concepts,
            applied: applied.concepts,
            total: applied.total,
            fibo: pack.counts.fibo,
            commons: pack.counts.commons,
            localExtensions: pack.counts.localExtensions,
            objectProperties: pack.counts.objectProperties,
            axioms: pack.counts.axioms,
          },
          query: q || null,
          hits,
        }
        return
      }
      case ONTOLOGY_AGENT_BRIDGE_FIBO_EVIDENCE_PATH:
        ctx.body = { ok: true, evidence: fiboEvidence(spec, instances) }
        return
      case ONTOLOGY_AGENT_BRIDGE_FIBO_GLOSSARY_PATH:
        ctx.body = { ok: true, glossary: fiboGlossary() }
        return
      case ONTOLOGY_AGENT_BRIDGE_FIBO_MAPPINGS_PATH:
        ctx.body = { ok: true, mappings: fiboMappings() }
        return
      case ONTOLOGY_AGENT_BRIDGE_FIBO_DOMAINS_PATH:
        ctx.body = { ok: true, domains: fiboDomains() }
        return
      case ONTOLOGY_AGENT_BRIDGE_FIBO_OPS_PATH:
        ctx.body = { ok: true, ops: fiboOpsSnapshot(spec, instances) }
        return
      default:
        return next()
    }
  })
}

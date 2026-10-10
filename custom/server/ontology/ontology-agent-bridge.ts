/**
 * 本体 agent 桥（公开段，cron-bridge 同款安全形态）——2026-10-10 四阶段路线二配套。
 *
 * 动机：validatorExec 门在 agent（kanban 结卡事务）里执行，调 studio 的
 * /validate-task 端点在鉴权段内（401 fail-open，工具形同虚设）。照 cron-bridge
 * 先例把该端点的 agent 版挂到公开段：
 *   POST /api/ontology/agent-bridge/validate-task   （body: board, taskId）
 * 安全姿态（如实登记）：
 *   - 来源限本机回环（agent 与 studio 同主机同用户运行——该进程本就能直读写
 *     ONTOLOGY_DIR 与 kanban 库文件，桥不引入新的攻击面）；
 *   - ONTOLOGY_BRIDGE_TOKEN 设立即启用 token 校验（fail-closed：设了不匹配 401）；
 *     缺省不强制——回环限制已是本机同信任域。
 * 行为与鉴权段 /api/hermes/ontology/validate-task 完全同芯（同一 ingestSingleTask）。
 */
import type { Context, Next } from 'koa'
import { ingestSingleTask } from './ontology-watch'

export const ONTOLOGY_AGENT_BRIDGE_PATH = '/api/ontology/agent-bridge/validate-task'

function isLoopback(ip: string | undefined): boolean {
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip === undefined
}

export function registerOntologyAgentBridgeRoutes(app: {
  use: (mw: (ctx: Context, next: Next) => Promise<void>) => void
}, env: Record<string, string | undefined> = process.env): void {
  app.use(async (ctx, next) => {
    if (ctx.method !== 'POST' || ctx.path !== ONTOLOGY_AGENT_BRIDGE_PATH) return next()
    if (!isLoopback(ctx.ip)) {
      ctx.status = 403
      ctx.body = { ok: false, error: 'loopback only' }
      return
    }
    const token = env.ONTOLOGY_BRIDGE_TOKEN?.trim()
    if (token && ctx.get('x-ontology-bridge-token') !== token) {
      ctx.status = 401
      ctx.body = { ok: false, error: 'bad bridge token' }
      return
    }
    const body = (ctx.request.body ?? {}) as { board?: unknown; taskId?: unknown }
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
}

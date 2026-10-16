// overlay/custom/server/incident/incident-controller.ts
// 事故报告 REST（/api/incident/*）——2026-10-08 六文调研轮 A+B。
//
// GET /api/incident/sessions/:id/report        JSON 报告（含 17 要素 + 自治度对账）
// GET /api/incident/sessions/:id/report.md     Markdown 导出（Content-Disposition 附件）
// GET /api/incident/sessions/:id/autonomy      仅 B 面（理论 vs 实际对账）
//
// sessionId 严格字符集校验（对齐 trace.ts SecTraceSandbox 先例：只读文件面防路径遍历）。
import Router from '@koa/router'
import { buildIncidentReport } from './incident-report'
import { renderIncidentMarkdown } from './incident-markdown'

export const incidentRoutes = new Router({ prefix: '/api/incident' })

const SESSION_ID_RE = /^[A-Za-z0-9._-]+$/

function invalidId(ctx: { status: number; body: unknown }, id: string | undefined): boolean {
  if (!id || !SESSION_ID_RE.test(id)) {
    ctx.status = 400
    ctx.body = { error: 'Invalid session_id（仅允许 A-Za-z0-9._-）' }
    return true
  }
  return false
}

/** query → IncidentOpts（推演轮聚合窗口，run18 复盘：驱动侧传 run_started_at/当前时刻）。 */
function optsFromQuery(ctx: { query: Record<string, string | string[] | undefined> }) {
  const num = (v: string | string[] | undefined) => {
    const s = Array.isArray(v) ? v[0] : v
    const n = s !== undefined ? Number(s) : NaN
    return Number.isFinite(n) && n >= 0 ? n : undefined
  }
  const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined
  return {
    windowSince: num(ctx.query.since),
    windowUntil: num(ctx.query.until),
    // A7（2026-10-16）：跨天轮次真窗判据——state_env query 显式 > env 兜底；
    // 驱动导出时带 ?state_env=<锚定轮路径>，窗口以 run_started_at→now 精确覆盖。
    stateEnvPath: str(ctx.query.state_env) || process.env.HERMES_INCIDENT_STATE_ENV,
  }
}

incidentRoutes.get('/sessions/:id/report', (ctx) => {
  const id = ctx.params.id
  if (invalidId(ctx, id)) return
  ctx.body = buildIncidentReport(id, optsFromQuery(ctx))
})

incidentRoutes.get('/sessions/:id/report.md', (ctx) => {
  const id = ctx.params.id
  if (invalidId(ctx, id)) return
  const report = buildIncidentReport(id, optsFromQuery(ctx))
  ctx.type = 'text/markdown; charset=utf-8'
  ctx.set('Content-Disposition', `attachment; filename="incident-report-${id}.md"`)
  ctx.body = renderIncidentMarkdown(report)
})

incidentRoutes.get('/sessions/:id/autonomy', (ctx) => {
  const id = ctx.params.id
  if (invalidId(ctx, id)) return
  const report = buildIncidentReport(id)
  ctx.body = { sessionId: id, generatedAt: report.generatedAt, autonomy: report.autonomy }
})

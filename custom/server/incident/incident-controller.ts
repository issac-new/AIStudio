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

incidentRoutes.get('/sessions/:id/report', (ctx) => {
  const id = ctx.params.id
  if (invalidId(ctx, id)) return
  ctx.body = buildIncidentReport(id)
})

incidentRoutes.get('/sessions/:id/report.md', (ctx) => {
  const id = ctx.params.id
  if (invalidId(ctx, id)) return
  const report = buildIncidentReport(id)
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

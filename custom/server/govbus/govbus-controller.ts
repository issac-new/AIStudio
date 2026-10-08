// overlay/custom/server/govbus/govbus-controller.ts
// 治理事件总线 REST（六文调研轮 F）：只读查询面——emit 是进程内桥接专属，
// 不开公开写入口（防伪造事件流）。
import Router from '@koa/router'
import { queryGovEvents, GOV_EVENT_DOMAINS, GOV_EVENT_SEVERITIES, compactGovEvents, type GovEventDomain, type GovEventSeverity } from './event-log'

export const govBusRoutes = new Router({ prefix: '/api/hermes/governance-events' })

govBusRoutes.get('/', (ctx) => {
  const { domain, severity, minSeverity, typePrefix, sinceMs, limit } = ctx.query as Record<string, string | undefined>
  if (domain !== undefined && !GOV_EVENT_DOMAINS.includes(domain as GovEventDomain)) {
    ctx.status = 400
    ctx.body = { ok: false, detail: `domain 须为 ${GOV_EVENT_DOMAINS.join('/')}` }
    return
  }
  for (const s of [severity, minSeverity]) {
    if (s !== undefined && !GOV_EVENT_SEVERITIES.includes(s as GovEventSeverity)) {
      ctx.status = 400
      ctx.body = { ok: false, detail: `severity/minSeverity 须为 ${GOV_EVENT_SEVERITIES.join('/')}` }
      return
    }
  }
  const n = Number(limit ?? 100)
  const since = Number(sinceMs)
  ctx.body = {
    ok: true,
    events: queryGovEvents({
      domain: domain as GovEventDomain | undefined,
      severity: severity as GovEventSeverity | undefined,
      minSeverity: minSeverity as GovEventSeverity | undefined,
      typePrefix,
      sinceMs: Number.isFinite(since) ? since : undefined,
      limit: Number.isFinite(n) ? n : 100,
    }),
  }
})

govBusRoutes.post('/compact', (ctx) => {
  // 环形裁剪触发（管理操作；幂等）。
  ctx.body = { ok: true, result: compactGovEvents() }
})

// capabilitypool/controller.ts —— 能力供需只读面（/api/harness/capabilitypool/*）
//
// 只读：不写存储、不改 assignee、不派单。候选与准入是建议，内核 dispatcher 仍是唯一 spawn 权威。
import Router from '@koa/router'
import type { Context } from 'koa'

import { fail, ok } from '../lib/http'
import { assessCapabilityReadiness } from './derive'
import { collectAgentLoads, collectCapabilityPoolReport, collectGraph } from './collect'
import { validateCapabilityTags } from './types'

export const capabilityPoolRoutes = new Router()

function queryTags(ctx: Context): string[] {
  const raw = ctx.query.tags
  const parts = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : []
  return parts.map((tag) => String(tag).trim()).filter(Boolean)
}

capabilityPoolRoutes.get('/supply-demand', async (ctx) => {
  try {
    const report = await collectCapabilityPoolReport()
    ok(ctx, { report })
  } catch (e) {
    fail(ctx, 500, e instanceof Error ? e.message : String(e), { code: 'capability_pool_failed' })
  }
})

capabilityPoolRoutes.get('/candidates', async (ctx) => {
  const tags = queryTags(ctx)
  const parsed = validateCapabilityTags(tags)
  if (parsed.issues.length > 0) {
    fail(ctx, 422, '能力标签不合法', {
      code: 'invalid_capability_tags',
      problems: parsed.issues.map((issue) => `${issue.reason}:${issue.tag}`),
    })
    return
  }
  if (parsed.valid.length === 0) {
    fail(ctx, 400, '至少给一个能力标签', { code: 'missing_tags' })
    return
  }

  try {
    const [report, graph, loads] = await Promise.all([
      collectCapabilityPoolReport(),
      Promise.resolve(collectGraph()),
      collectAgentLoads(),
    ])
    const supplyTags = report.rows
      .filter((row) => row.supplyUnits + row.supplyAgents + row.supplySkills > 0)
      .map((row) => row.tag)
    const candidates = graph.agents.map((agent) => ({
      agentId: agent.name,
      tags: agent.capabilities,
      reliability: agent.reliability,
      load: loads.get(agent.name) ?? 0,
      evidenceRefs: [`graph:${agent.name}`],
    }))
    const anySourceAvailable = Object.entries(report.sources)
      .filter(([key]) => key !== 'external-experts')
      .some(([, source]) => source.available)
    const assigneeName = typeof ctx.query.assignee === 'string' ? ctx.query.assignee.trim() : ''
    const assigneeAgent = assigneeName ? graph.agents.find((agent) => agent.name === assigneeName) : undefined
    const assignee = assigneeName
      ? { agentId: assigneeName, tags: graph.available ? (assigneeAgent?.capabilities ?? []) : null }
      : null

    const readiness = assessCapabilityReadiness({
      requiredTags: parsed.valid,
      supplyTags,
      assignee,
      candidates,
      anySourceAvailable,
    })
    ok(ctx, {
      readiness,
      requiredTags: parsed.valid,
      supplyTags,
      sources: report.sources,
      unknowns: report.unknowns,
    })
  } catch (e) {
    fail(ctx, 500, e instanceof Error ? e.message : String(e), { code: 'capability_candidates_failed' })
  }
})

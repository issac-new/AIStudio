// overlay/custom/server/controllers/hermes/fleet.ts
//
// 指挥中心 REST API（2.13）：
//   GET  /api/hermes/fleet/sessions      舰队快照（live + DB 合并，按权限过滤）
//   POST /api/hermes/fleet/approval      跨 profile 就地审批
//   POST /api/hermes/fleet/clarify       跨 profile 就地澄清应答
//   GET  /api/hermes/kanban/overview     全 board 任务聚合（缓存 + 共享 watcher）
//   GET|POST /api/hermes/teams           团队 CRUD
//   PUT|DELETE /api/hermes/teams/:id
//
// factory-DI：与 loop/controllers 同模式 —— 依赖由 patch 196 从
// bootstrap/routes.ts 注入（受保护段挂载，继承全局鉴权，ctx.state.user 可用）。

import Router from '@koa/router'
import type { Context } from 'koa'
import type { FleetSession } from '../../services/hermes/fleet-snapshot'
import type { KanbanOverviewResult } from '../../services/hermes/kanban-overview'

export interface FleetRouterDeps {
  buildSnapshot: () => FleetSession[]
  respondApproval: (approvalId: string, choice: string) => Promise<{ resolved: boolean; error?: string }>
  respondClarify: (clarifyId: string, response: string) => Promise<{ resolved: boolean; error?: string }>
  getSession: (sessionId: string) => { profile?: string | null } | null
  getOverview: () => Promise<KanbanOverviewResult>
  teams: {
    list(): Promise<any[]>
    create(input: any): Promise<any>
    update(id: string, patch: any): Promise<any | null>
    remove(id: string): Promise<boolean>
  }
  userCanAccessProfile: (userId: number, profile: string) => boolean
}

const APPROVAL_CHOICES = new Set(['once', 'session', 'always', 'deny'])

function currentUser(ctx: Context): { id: number; role: string; username?: string } | null {
  const user = (ctx.state as any).user
  if (!user || typeof user.id !== 'number') return null
  return user
}

function canAccessProfile(user: { id: number; role: string } | null, profile: string, deps: FleetRouterDeps): boolean {
  if (!user) return true // 未启用鉴权的部署
  if (user.role === 'super_admin') return true
  return deps.userCanAccessProfile(user.id, profile || 'default')
}

export function createFleetRouter(deps: FleetRouterDeps): Router {
  const router = new Router()

  router.get('/api/hermes/fleet/sessions', async ctx => {
    const user = currentUser(ctx)
    let sessions = deps.buildSnapshot()
    if (user && user.role !== 'super_admin') {
      sessions = sessions.filter(item => deps.userCanAccessProfile(user.id, item.profile || 'default'))
    }
    ctx.body = { sessions, ts: Date.now() }
  })

  router.post('/api/hermes/fleet/approval', async ctx => {
    const body = ctx.request.body as { session_id?: string; approval_id?: string; choice?: string } || {}
    const sessionId = String(body.session_id || '').trim()
    const approvalId = String(body.approval_id || '').trim()
    const choice = String(body.choice || '').trim()
    if (!sessionId || !approvalId || !APPROVAL_CHOICES.has(choice)) {
      ctx.status = 400
      ctx.body = { error: 'session_id, approval_id and a valid choice (once|session|always|deny) are required' }
      return
    }
    const session = deps.getSession(sessionId)
    if (!session) {
      ctx.status = 404
      ctx.body = { error: 'session not found' }
      return
    }
    if (!canAccessProfile(currentUser(ctx), String(session.profile || 'default'), deps)) {
      ctx.status = 403
      ctx.body = { error: 'profile not available for this user' }
      return
    }
    const result = await deps.respondApproval(approvalId, choice)
    if (!result.resolved) ctx.status = 409
    ctx.body = result
  })

  router.post('/api/hermes/fleet/clarify', async ctx => {
    const body = ctx.request.body as { session_id?: string; clarify_id?: string; response?: string } || {}
    const sessionId = String(body.session_id || '').trim()
    const clarifyId = String(body.clarify_id || '').trim()
    const response = String(body.response || '').trim()
    if (!sessionId || !clarifyId || !response) {
      ctx.status = 400
      ctx.body = { error: 'session_id, clarify_id and response are required' }
      return
    }
    const session = deps.getSession(sessionId)
    if (!session) {
      ctx.status = 404
      ctx.body = { error: 'session not found' }
      return
    }
    if (!canAccessProfile(currentUser(ctx), String(session.profile || 'default'), deps)) {
      ctx.status = 403
      ctx.body = { error: 'profile not available for this user' }
      return
    }
    const result = await deps.respondClarify(clarifyId, response)
    if (!result.resolved) ctx.status = 409
    ctx.body = result
  })

  router.get('/api/hermes/kanban/overview', async ctx => {
    ctx.body = await deps.getOverview()
  })

  router.get('/api/hermes/teams', async ctx => {
    ctx.body = { teams: await deps.teams.list() }
  })

  router.post('/api/hermes/teams', async ctx => {
    const user = currentUser(ctx)
    if (user && user.role !== 'super_admin') {
      ctx.status = 403
      ctx.body = { error: 'only super admins can manage teams' }
      return
    }
    const body = ctx.request.body as any || {}
    try {
      ctx.status = 201
      ctx.body = { team: await deps.teams.create(body) }
    } catch (err) {
      ctx.status = 400
      ctx.body = { error: err instanceof Error ? err.message : String(err) }
    }
  })

  router.put('/api/hermes/teams/:id', async ctx => {
    const user = currentUser(ctx)
    if (user && user.role !== 'super_admin') {
      ctx.status = 403
      ctx.body = { error: 'only super admins can manage teams' }
      return
    }
    const body = ctx.request.body as any || {}
    try {
      const team = await deps.teams.update(String(ctx.params.id || ''), body)
      if (!team) {
        ctx.status = 404
        ctx.body = { error: 'team not found' }
        return
      }
      ctx.body = { team }
    } catch (err) {
      ctx.status = 400
      ctx.body = { error: err instanceof Error ? err.message : String(err) }
    }
  })

  router.delete('/api/hermes/teams/:id', async ctx => {
    const user = currentUser(ctx)
    if (user && user.role !== 'super_admin') {
      ctx.status = 403
      ctx.body = { error: 'only super admins can manage teams' }
      return
    }
    const removed = await deps.teams.remove(String(ctx.params.id || ''))
    if (!removed) {
      ctx.status = 404
      ctx.body = { error: 'team not found' }
      return
    }
    ctx.status = 204
    ctx.body = null
  })

  return router
}

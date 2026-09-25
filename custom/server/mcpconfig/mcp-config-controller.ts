/**
 * MCP 配置管理 REST（/api/mcp-config）——kimi /mcp-config 余项吸收（矩阵 §3.3 P1）。
 *
 * POST /api/mcp-config                upsert（scope 三选一/timeout 有界/needs-auth）
 * GET  /api/mcp-config                全量列表
 * GET  /api/mcp-config/needs-auth     needs-auth 待办（IdeMcpPane action 提示面）
 * POST /api/mcp-config/:name/auth     闭环（authorize|dismiss）
 *
 * 挂载：B 类 patch 459 在 bootstrap/routes.ts。
 */
import Router from '@koa/router'
import { closeAuthLoop, isMcpScope, listNeedsAuth, loadServer, upsertServer } from './mcp-config'

const router = new Router({ prefix: '/api/mcp-config' })

router.post('/', async (ctx) => {
  const body = (ctx.request.body ?? {}) as Record<string, unknown>
  const { name, scope, timeoutMs, authState, authAction } = body as Record<string, unknown>
  if (typeof name !== 'string' || !name || !isMcpScope(scope)) {
    ctx.status = 400
    ctx.body = { ok: false, detail: 'name 必填；scope 须为 project|global|session' }
    return
  }
  const cfg = upsertServer({
    name,
    scope,
    timeoutMs: typeof timeoutMs === 'number' ? timeoutMs : 0,
    authState: authState === 'needs-auth' || authState === 'dismissed' ? authState : 'authorized',
    authAction: typeof authAction === 'string' ? authAction : undefined,
  })
  ctx.body = { ok: true, config: cfg }
})

router.get('/', async (ctx) => {
  const names = Array.isArray(ctx.query.names) ? ctx.query.names : ctx.query.name ? [ctx.query.name] : []
  const configs = names.map((n) => loadServer(String(n))).filter(Boolean)
  ctx.body = { ok: true, configs }
})

router.get('/needs-auth', async (ctx) => {
  ctx.body = { ok: true, needsAuth: listNeedsAuth() }
})

router.post('/:name/auth', async (ctx) => {
  const body = (ctx.request.body ?? {}) as Record<string, unknown>
  const outcome = body.outcome
  if (outcome !== 'authorize' && outcome !== 'dismiss') {
    ctx.status = 400
    ctx.body = { ok: false, detail: 'outcome 须为 authorize|dismiss' }
    return
  }
  const result = closeAuthLoop(ctx.params.name, outcome)
  if ('error' in result) {
    ctx.status = 404
    ctx.body = { ok: false, detail: result.error }
    return
  }
  ctx.body = { ok: true, config: result }
})

export const mcpConfigRoutes = router

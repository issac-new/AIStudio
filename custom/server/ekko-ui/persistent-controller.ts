/**
 * 持久界面的 HTTP 路由（批二）：/api/studio/surfaces 下的八个接口。
 *
 * 两类调用方，身份都来自上游鉴权中间件放进请求上下文的字段：
 * - MCP 工具（创建/更新/查看/关闭/目录）：绑定当前轮的调用带运行凭证，中间件已据此
 *   填好 state.user 与 state.profile；其余用登录令牌 + X-Hermes-Profile。
 * - 浏览器客户端（读取/保存状态/记录提交）：登录令牌 + 显式 profile 参数。
 *
 * 失败语义（spec D11）：写操作失败一律非 2xx；读取时界面不存在或归属不符返回
 * 200 + available:false（读模型 fail-soft，与写操作的 404 区分开）。
 *
 * 宿主实例由补丁 820 在服务启动时登记进来——自定义代码不反向引用上游模块。
 */
import Router from '@koa/router'
import type { Context } from 'koa'
import { bodyOf, created, fail, ok } from '../lib/http'
import { SurfaceError } from './contract'
import type { PersistentSurfaces } from './persistent-surfaces'

export const PERSISTENT_SURFACE_PREFIX = '/api/studio/surfaces'

export const persistentSurfaceRoutes = new Router({ prefix: PERSISTENT_SURFACE_PREFIX })

let host: PersistentSurfaces | null = null

/** 由上游装配代码调用（patches/820），把注入了依赖的宿主交进来；传 null 即下线。 */
export function setPersistentSurfaceHost(next: PersistentSurfaces | null): void {
  host = next
}

interface Owner { profile: string; userId?: string }

function withUser(ctx: Context, profile: string): Owner {
  // 上游的登录用户编号是数字；运行凭证请求可能没有用户
  const userId: unknown = ctx.state?.user?.id
  const text = userId === undefined || userId === null ? '' : String(userId).trim()
  return { profile, ...(text ? { userId: text } : {}) }
}

/** 请求上下文里必须有 profile（中间件已按令牌填好）；缺了是服务端配置问题，不是调用方能修的。 */
function ownerFromState(ctx: Context): Owner {
  const profile = String(ctx.state?.profile?.name ?? '').trim()
  if (!profile) throw new SurfaceError('Request profile is unavailable', 500)
  return withUser(ctx, profile)
}

/** 客户端显式指定 profile；必须是单个安全标识符。 */
function ownerFromQuery(ctx: Context): Owner {
  const raw = (ctx.query as Record<string, unknown> | undefined)?.profile
  const profile = Array.isArray(raw) ? raw[0] : raw
  if (typeof profile !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(profile)) {
    throw new SurfaceError('profile is required (1-64 letters, digits, underscores or dashes)', 400)
  }
  return withUser(ctx, profile)
}

type ErrWithDetails = SurfaceError & { problems?: unknown; currentRevision?: unknown }

/** 统一响应助手的 problems 是字符串数组：每条问题写成一行「路径：原因（代码）」，模型与人都能直接读。 */
function problemLines(problems: unknown): string[] | undefined {
  if (!Array.isArray(problems)) return undefined
  return problems.slice(0, 8).map(item => {
    const problem = item as { path?: string; code?: string; message?: string } | null
    if (!problem || typeof problem !== 'object') return String(item)
    return `${problem.path || 'spec'}：${problem.message ?? ''}（${problem.code ?? 'invalid'}）`
  })
}

/** 统一出口：SurfaceError 按其状态码返回，problems 与 current_revision 附带；其余异常向上抛。 */
type Responder = (ctx: Context, value: unknown) => void

const respondOk: Responder = (ctx, value) => ok(ctx, value as Record<string, unknown>)
const respondCreated: Responder = (ctx, value) => created(ctx, value as Record<string, unknown>)

async function handle(ctx: Context, run: (surface: PersistentSurfaces) => Promise<unknown>, success: Responder = respondOk): Promise<void> {
  if (!host) {
    fail(ctx, 503, 'Persistent surfaces are not available on this server')
    return
  }
  try {
    success(ctx, await run(host))
  } catch (error) {
    if (!(error instanceof SurfaceError)) throw error
    const details = error as ErrWithDetails
    const problems = problemLines(details.problems)
    fail(ctx, error.status, error.message, {
      ...(problems ? { problems } : {}),
      ...(typeof details.currentRevision === 'number' ? { extra: { current_revision: details.currentRevision } } : {}),
    })
  }
}

// ---- MCP 侧 ----

persistentSurfaceRoutes.post('/create', async (ctx) => {
  await handle(ctx, h => h.create(bodyOf(ctx), ownerFromState(ctx)), respondCreated)
})

persistentSurfaceRoutes.post('/update', async (ctx) => {
  await handle(ctx, h => h.update(bodyOf(ctx), ownerFromState(ctx)))
})

persistentSurfaceRoutes.post('/inspect', async (ctx) => {
  await handle(ctx, h => h.inspect(bodyOf(ctx), ownerFromState(ctx)))
})

persistentSurfaceRoutes.post('/close', async (ctx) => {
  await handle(ctx, h => h.close(bodyOf(ctx), ownerFromState(ctx)))
})

persistentSurfaceRoutes.get('/catalog', async (ctx) => {
  await handle(ctx, h => h.catalog((ctx.query ?? {}) as { q?: string; category?: string }), (ctx, value) => ok(ctx, { catalog: value }))
})

// ---- 客户端侧 ----
// 界面编号形如 srf:<会话号>:<界面 slug>：冒号不是路径分隔符，所以整段是一个路径参数
//（2026-11-25 实测：路由器对 srf:s1:x 与编码后的 srf%3As1%3Ax 都能匹配并解码）。
// 但把斜杠编码进参数（%2F）后，路由器会解码出带斜杠的编号——所以入口处统一校验格式。

const SURFACE_ID_RE = /^srf:[A-Za-z0-9_-]{1,128}:[A-Za-z0-9_-]{1,64}$/

function surfaceIdParam(ctx: Context): string {
  const surfaceId = String(ctx.params.surfaceId ?? '')
  if (!SURFACE_ID_RE.test(surfaceId)) {
    throw new SurfaceError('surface id must look like srf:<session>:<slug>', 400)
  }
  return surfaceId
}

persistentSurfaceRoutes.get('/:surfaceId', async (ctx) => {
  await handle(ctx, h => h.view(surfaceIdParam(ctx), ownerFromQuery(ctx)))
})

persistentSurfaceRoutes.put('/:surfaceId/state', async (ctx) => {
  const body = bodyOf(ctx)
  await handle(ctx, h => h.saveState(surfaceIdParam(ctx), body.state, body.revision, ownerFromQuery(ctx)))
})

persistentSurfaceRoutes.post('/:surfaceId/actions', async (ctx) => {
  const body = bodyOf(ctx)
  await handle(ctx, async h => {
    const surfaceId = surfaceIdParam(ctx)
    const owner = ownerFromQuery(ctx)
    if (body.action_id === 'close') return h.closeByUser(surfaceId, owner)
    return h.recordSubmission(surfaceId, body.action_id, body.payload, body.revision, owner)
  })
})

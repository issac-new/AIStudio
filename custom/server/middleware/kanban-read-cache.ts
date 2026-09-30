// overlay/custom/server/middleware/kanban-read-cache.ts
// CLI 读端点缓存中间件（2026-09-30 性能批）：实测每个 hermes CLI 子进程
// 4-6s（bootstrap venv 同步检查 ~1s + 运行时），页面一次并发多个读端点、
// exec 队列并发 2 —— 「点开任意页面特别卡顿」的主因（例：设置页点「模型」
// 墙钟 6s，其中 kanban/boards 4.4s + kanban/assignees 4.3s）。
// 语义：
//   · 白名单 GET → 按「用户 + 完整 URL」键 TTL 缓存（stats/assignees 有按
//     用户可见性过滤，键必须含用户）；并发同键 single-flight 共享一次回源。
//   · 前缀内任何非 GET（增删改）→ 全量失效（同进程内 UI 变更即时生效；
//     agent 侧异步变更由 TTL 兜底上限）。
//   · 命中回 X-Read-Cache: hit（可观测）；不改动鉴权链（中间件挂在鉴权
//     中间件之后，未认证请求到不了这里）。
// 实例与挂载（均顶层 app.use 直挂——@koa/router 的 router.use 仅在同 router
// 有匹配路由时才执行，挂在 fleetRouter 上拦不住 boards 等上游路由，最小复现实证）：
//   · kanbanReadCache：patch 528 于 fleetRouter/kanbanRoutes 之前直挂（routes.ts
//     §309 前一行的 app.use）。
//   · profileReadCache：profiles 路由挂载（routes.ts §281）更早，由 patch 528
//     在 profileRoutes 之前直挂。
import type { Context, Next } from 'koa'

export interface ReadCacheOptions {
  /** 参与缓存的 GET 路径白名单（pathname 精确匹配） */
  whitelist?: ReadonlySet<string>
  /** 参与缓存的 GET 路径正则（动态路径如任务详情 /api/hermes/kanban/t_xxx） */
  match?: RegExp
  /** 拦截与失效判定的路径前缀 */
  prefix: string
  /** TTL 上限：不经本进程的写入（agent 侧/CLI 直写）的最长陈旧窗口（板级
   *  事件已接失效回调时可放宽——见 command-post onBoardEvent 接线） */
  ttlMs: number
  maxEntries?: number
}

interface CacheEntry {
  expiresAt: number
  status: number
  body: unknown
}

export interface ReadCacheMiddleware {
  (ctx: Context, next: Next): Promise<void>
  /** 全量失效（外部事件触发用） */
  flush(): void
}

export function createReadCacheMiddleware(opts: ReadCacheOptions): ReadCacheMiddleware {
  const { whitelist, match, prefix, ttlMs } = opts
  const maxEntries = opts.maxEntries ?? 128
  const cache = new Map<string, CacheEntry>()
  const inflight = new Map<string, Promise<void>>()

  function cacheable(path: string): boolean {
    if (whitelist?.has(path)) return true
    if (match?.test(path)) return true
    return false
  }

  function cacheKey(ctx: Context): string {
    const user = (ctx.state as { user?: { id?: number } }).user
    // profile 维度（性能批二轮补）：客户端按 X-Hermes-Profile 请求 profile 态
    // 数据，键缺 profile 会在切换 profile 后串数据
    const profile = ctx.get('X-Hermes-Profile') || 'default'
    return `${user?.id ?? 'anon'}|${profile}|${ctx.url}`
  }

  async function middleware(ctx: Context, next: Next): Promise<void> {
    if (!ctx.path.startsWith(prefix)) return next()

    // 写路径：先放行，落定后全量失效（同进程内 UI 变更即时生效）
    if (ctx.method !== 'GET' && ctx.method !== 'HEAD') {
      await next()
      cache.clear()
      return
    }

    if (!cacheable(ctx.path)) return next()

    const key = cacheKey(ctx)
    const hit = cache.get(key)
    if (hit && hit.expiresAt > Date.now()) {
      ctx.set('X-Read-Cache', 'hit')
      ctx.status = hit.status
      ctx.body = hit.body
      return
    }

    // single-flight：并发同键共享一次回源
    const existing = inflight.get(key)
    if (existing) {
      await existing
      const fresh = cache.get(key)
      if (fresh && fresh.expiresAt > Date.now()) {
        ctx.set('X-Read-Cache', 'hit')
        ctx.status = fresh.status
        ctx.body = fresh.body
        return
      }
      // 回源失败（未入缓存）：直接放行重试一次
      return next()
    }

    const fill = (async () => {
      await next()
      if (ctx.status >= 200 && ctx.status < 300 && ctx.body !== undefined) {
        if (cache.size >= maxEntries) {
          // 淘汰最早入缓存项（Map 保插入序，首键最旧）
          const oldest = cache.keys().next().value
          if (oldest !== undefined) cache.delete(oldest)
        }
        cache.set(key, { expiresAt: Date.now() + ttlMs, status: ctx.status, body: ctx.body })
      }
    })()
    inflight.set(key, fill)
    try {
      await fill
    } finally {
      inflight.delete(key)
    }
  }

  middleware.flush = () => {
    cache.clear()
  }

  return middleware
}

/** 看板读端点缓存（性能批二轮 2026-09-30 按钮排查扩面）：
 *  · 白名单：任务列表 /api/hermes/kanban（客户端主数据面，10s 级反复拉）、
 *    boards/stats/assignees/projects/capabilities/diagnostics（后者实测 32s）；
 *  · 正则：任务详情 /api/hermes/kanban/t_xxx——任务链路 BFS（loadLinksChain
 *    深度 2 父子展开）实测 N+1 风暴，单任务 getTask 10-28s（CLI 子进程）；
 *  · TTL 20s：板级 WS 事件已接失效（command-post onBoardEvent → flush），
 *    agent 侧写看板可近实时失效，TTL 仅兜底。 */
export const kanbanReadCache = createReadCacheMiddleware({
  prefix: '/api/hermes/kanban',
  whitelist: new Set([
    '/api/hermes/kanban',
    '/api/hermes/kanban/boards',
    '/api/hermes/kanban/stats',
    '/api/hermes/kanban/assignees',
    '/api/hermes/kanban/projects',
    '/api/hermes/kanban/capabilities',
    '/api/hermes/kanban/diagnostics',
  ]),
  match: /^\/api\/hermes\/kanban\/t_[A-Za-z0-9_-]+$/,
  ttlMs: 20_000,
  maxEntries: 256,
})

/** profiles 读缓存（GET /api/hermes/profiles；配置面变更少，TTL 30s；任一
 *  非 GET /api/hermes/profiles* 落定即失效） */
export const profileReadCache = createReadCacheMiddleware({
  prefix: '/api/hermes/profiles',
  whitelist: new Set(['/api/hermes/profiles']),
  ttlMs: 30_000,
})

/** 测试专用：复位两个实例的模块态 */
export function __resetKanbanReadCacheForTest(): void {
  kanbanReadCache.flush()
  profileReadCache.flush()
}

// 兼容旧引用名（头注释与早期测试用 kanban-read-cache 语义名）
export { kanbanReadCache as readCacheForKanban }

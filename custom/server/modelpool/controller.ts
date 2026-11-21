// overlay[modelpool] 只读 REST：统一模型池投影（spec 2026-11-21-model-pool-unification）。
// GET /api/modelpool  上游判定（env 态如实暴露）＋白名单；fail-soft：纯投影无外部依赖，
// 不猜数——上游可用性由调用方实测，本端点只报配置态。
// 响应形状统一走 custom/server/lib/http.ts（K19 棘轮：新代码不手写响应体）。
import Router from '@koa/router'
import { ok } from '../lib/http'
import {
  DEFAULT_UPSTREAM, EKKO_MODEL_UPSTREAM_ENV, UNIFIED_POOL, resolveModelUpstream,
} from './pool'

const router = new Router({ prefix: '/api/modelpool' })

export async function modelPoolView(ctx: any): Promise<void> {
  const upstream = resolveModelUpstream()
  ok(ctx, {
    unified: upstream.unified,
    upstreamBaseUrl: upstream.unified ? upstream.baseUrl : null,
    env: EKKO_MODEL_UPSTREAM_ENV,
    defaultUpstream: DEFAULT_UPSTREAM,
    pool: UNIFIED_POOL,
  })
}

router.get('/', modelPoolView)

export const modelPoolRoutes = router

// overlay/custom/server/pipeline/pipeline-controller.ts
// 持续流水线 REST 面（挂在巡检官 router 前缀下，零 upstream patch）：
//   GET /api/hermes/cluster-inspector/pipeline/status  全分支状态机视图
//   POST /api/hermes/cluster-inspector/pipeline/run    手动跑一轮（采集+推演+触发）
// 引擎随巡检官启动（startPipelineIfEnabled，PIPELINE=off 可关）。
import Router from '@koa/router'
import { PipelineEngine } from './pipeline-engine'

export function createPipelineRouter(engine: PipelineEngine): Router {
  const router = new Router({ prefix: '/api/hermes/cluster-inspector/pipeline' })
  router.get('/status', (ctx) => { ctx.body = engine.status() })
  router.post('/run', async (ctx) => { ctx.body = await engine.runOnce() })
  return router
}

/** 巡检官同款启动入口：PIPELINE=off 旁路 */
export function startPipelineIfEnabled(engine: PipelineEngine, intervalMs = 60_000): void {
  if (process.env.PIPELINE === 'off') return
  engine.start(intervalMs)
}

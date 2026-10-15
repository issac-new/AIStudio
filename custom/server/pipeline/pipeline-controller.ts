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

  // 并行评审编排（V8.35）：POST /review/start {id,finalJudge,verdictPrefix,legs?}（legs 缺省=G5 模板）
  // GET /review/status；send 通道=巡检官同链 matrixSend（readGatewayMatrixEnv 凭据）
  router.get('/review/status', (ctx) => {
    const { parallelReview } = require('./parallel-review') as typeof import('./parallel-review')
    ctx.body = parallelReview.status()
  })
  router.post('/review/start', async (ctx) => {
    if (process.env.PARALLEL_REVIEW === 'off') { ctx.body = { error: 'off' }; return }
    const { id, finalJudge, verdictPrefix, legs } = (ctx.request.body ?? {}) as Record<string, unknown>
    if (typeof id !== 'string' || typeof finalJudge !== 'string' || typeof verdictPrefix !== 'string') {
      ctx.status = 400; ctx.body = { error: 'need id/finalJudge/verdictPrefix' }; return
    }
    const { parallelReview, g5LegsTemplate } = require('./parallel-review') as typeof import('./parallel-review')
    const send = async (body: string, mentions: string[]) => {
      try {
        const { readGatewayMatrixEnv } = require('../matrix/gateway-env') as { readGatewayMatrixEnv: (e: unknown) => unknown }
        const { matrixSend } = require('../matrix/chat-bridge') as { matrixSend: (...a: unknown[]) => Promise<string> }
        const env = readGatewayMatrixEnv(process.env) as { homeserverUrl: string; accessToken: string } | null
        const room = process.env.CLUSTER_INSPECTOR_NUDGE_ROOM!
        const userIds = mentions.map((m) => (m.startsWith('@') ? m : `@${m}`))
        return await matrixSend(env, room, 'm.room.message',
          { msgtype: 'm.text', body, 'm.mentions': { user_ids: userIds } },
          globalThis.fetch.bind(globalThis), `pr-${Date.now()}`)
      } catch { return undefined }
    }
    const useLegs = Array.isArray(legs) && legs.length ? (legs as never[]) : (g5LegsTemplate() as unknown as never[])
    ctx.body = await parallelReview.start(id, finalJudge, verdictPrefix, useLegs as never)
  })
  return router
}

/** 巡检官同款启动入口：PIPELINE=off 旁路 */
export function startPipelineIfEnabled(engine: PipelineEngine, intervalMs = 60_000): void {
  if (process.env.PIPELINE === 'off') return
  engine.start(intervalMs)
}

// overlay/custom/server/clusterinspector/cluster-inspector-controller.ts
// REST 面：GET snapshot（最新采集+最近结果）/ POST run（手动巡检）。
// 挂载=patch 582（上游 bootstrap/routes.ts import+registerRoutes，同 govbus/autonomy-ladder 先例）。

import Router from '@koa/router'
import { ensureInspector, type InspectorDeps } from './inspector'

export function createClusterInspectorRouter(deps: InspectorDeps = {}): Router {
  const router = new Router({ prefix: '/api/hermes/cluster-inspector' })
  const insp = ensureInspector(deps)

  router.get('/snapshot', (ctx) => {
    const last = insp.lastRun
    ctx.body = {
      inspector: {
        enabled: process.env.CLUSTER_INSPECTOR !== 'off',
        lastRunAt: last?.ts ?? null,
        runs: insp.runs.slice(-10),
      },
      snapshot: insp.snapshot,
      anomalies: last?.anomalies ?? [],
    }
  })

  router.post('/run', async (ctx) => {
    const outcome = await insp.runOnce()
    ctx.body = { outcome, snapshot: insp.snapshot }
  })

  return router
}

export const clusterInspectorRoutes: Router = createClusterInspectorRouter()

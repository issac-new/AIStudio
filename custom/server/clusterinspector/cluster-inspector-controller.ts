// overlay/custom/server/clusterinspector/cluster-inspector-controller.ts
// REST 面：GET snapshot（最新采集+最近结果）/ POST run（手动巡检）。
// 挂载=patch 582（上游 bootstrap/routes.ts import+registerRoutes，同 govbus/autonomy-ladder 先例）。

import Router from '@koa/router'
import { execFile } from 'node:child_process'
import { hermesHomeDefault } from './collectors'
import { ensureInspector, type InspectorDeps } from './inspector'

/** kanban 诊断接线（v1 缺口收口）：CLI 桥（kanban-service 同款先例），fail-soft。 */
function kanbanDiagnosticsProvider(): (() => Promise<Array<Record<string, unknown>>>) | undefined {
  return () => new Promise((resolve, reject) => {
    execFile('hermes', ['kanban', 'diagnostics', '--json'], {
      timeout: 30_000,
      env: { ...process.env, HERMES_HOME: process.env.HERMES_HOME || hermesHomeDefault() },
    }, (err, stdout) => {
      if (err) { reject(err); return }
      try {
        const out = JSON.parse(stdout) as Record<string, unknown>
        resolve(Array.isArray(out.diagnostics) ? (out.diagnostics as Array<Record<string, unknown>>) : [])
      } catch (e) { reject(e as Error) }
    })
  })
}

export function createClusterInspectorRouter(deps: InspectorDeps = {}): Router {
  const router = new Router({ prefix: '/api/hermes/cluster-inspector' })
  const insp = ensureInspector({ getKanbanDiagnostics: kanbanDiagnosticsProvider(), ...deps })

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

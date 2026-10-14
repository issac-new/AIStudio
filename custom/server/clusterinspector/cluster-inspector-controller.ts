// overlay/custom/server/clusterinspector/cluster-inspector-controller.ts
// REST 面：GET snapshot（最新采集+最近结果）/ POST run（手动巡检）。
// 挂载=patch 582（上游 bootstrap/routes.ts import+registerRoutes，同 govbus/autonomy-ladder 先例）。

import Router from '@koa/router'
import { execFile } from 'node:child_process'
import { hermesHomeDefault } from './collectors'
import { ensureInspector, type InspectorDeps } from './inspector'

/** kanban 诊断接线（v1 缺口补齐）：CLI 桥（kanban-service 同款先例），fail-soft。 */
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

/** 在办卡接线（D7 在办任务·档案静默交叉）：CLI 桥 list --status running，fail-soft。 */
function runningCardsProvider(): (() => Promise<Array<Record<string, unknown>>>) | undefined {
  return () => new Promise((resolve, reject) => {
    execFile('hermes', ['kanban', 'list', '--status', 'running', '--json'], {
      timeout: 30_000,
      env: { ...process.env, HERMES_HOME: process.env.HERMES_HOME || hermesHomeDefault() },
    }, (err, stdout) => {
      if (err) { reject(err); return }
      try {
        const out = JSON.parse(stdout) as unknown
        resolve(Array.isArray(out) ? (out as Array<Record<string, unknown>>) : Array.isArray((out as { tasks?: unknown }).tasks) ? ((out as { tasks: Array<Record<string, unknown>> }).tasks) : [])
      } catch (e) { reject(e as Error) }
    })
  })
}

// 巡检环启动入口转发（routes.ts 挂载点 import 自本控制器——单一挂载面）
export { startInspectorIfEnabled } from './inspector'

/** 阻塞卡接线（card.blocked-stale 检测面，run19 G5 熔断死等产品化——用户 300s 时限）：CLI 桥 list --status blocked，fail-soft。 */
function blockedCardsProvider(): (() => Promise<Array<Record<string, unknown>>>) | undefined {
  return () => new Promise((resolve, reject) => {
    execFile('hermes', ['kanban', 'list', '--status', 'blocked', '--json'], {
      timeout: 30_000,
      env: { ...process.env, HERMES_HOME: process.env.HERMES_HOME || hermesHomeDefault() },
    }, (err, stdout) => {
      if (err) { reject(err); return }
      try {
        const out = JSON.parse(stdout) as unknown
        resolve(Array.isArray(out) ? (out as Array<Record<string, unknown>>) : Array.isArray((out as { tasks?: unknown }).tasks) ? ((out as { tasks: Array<Record<string, unknown>> }).tasks) : [])
      } catch (e) { reject(e as Error) }
    })
  })
}

export function createClusterInspectorRouter(deps: InspectorDeps = {}): Router {
  const router = new Router({ prefix: '/api/hermes/cluster-inspector' })
  // 联邦注册表快照（D8 跨机静默观测面）：读进度联邦注册表（有界内存快照，零 IO）。
function federationSnapshotProvider(): (() => { ok: boolean; nowMs: number; machines: Array<{ machineId: string; lastSeenMs: number; activeTasks: number; activeAgents?: number }> }) | undefined {
  try {
    // 动态 require（跨域桥接纪律同 emit/appendGovEvent；联邦模块缺席不炸）
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { registrySnapshot, federationEnabled } = require('../progress/federation')
    return () => ({
      ok: federationEnabled(),
      nowMs: Date.now(),
      machines: registrySnapshot().map((m: { machineId: string; lastSeenMs: number; lastEvent: { tasks?: unknown[]; activeAgents?: number } }) => ({
        machineId: m.machineId,
        lastSeenMs: m.lastSeenMs,
        activeTasks: m.lastEvent.tasks?.length ?? 0,
        activeAgents: m.lastEvent.activeAgents,
      })),
    })
  } catch {
    return undefined
  }
}

const insp = ensureInspector({ getKanbanDiagnostics: kanbanDiagnosticsProvider(), getRunningCards: runningCardsProvider(), getBlockedCards: blockedCardsProvider(), getFederationSnapshot: federationSnapshotProvider(), ...deps })

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
      // 收敛性面（同类风险是否持续收敛=多轮有效性指标；熵增→熔断/降级/升级）
      convergence: insp.convergenceFace,
    }
  })

  router.post('/run', async (ctx) => {
    const outcome = await insp.runOnce()
    ctx.body = { outcome, snapshot: insp.snapshot }
  })

  return router
}

export const clusterInspectorRoutes: Router = createClusterInspectorRouter()

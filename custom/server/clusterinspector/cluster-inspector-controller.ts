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

/** FAIL 判卡接线（review.fail-stall 复审环老化面）：CLI 桥 list --status done --json，fail-soft。
 *  run20 22:34 复审链断棒实录：修订入仓 75 分钟复审派单悬空——闸类 FAIL 卡零推进即老化。 */
function failedVerdictCardsProvider(): (() => Promise<Array<Record<string, unknown>>>) | undefined {
  return () => new Promise((resolve, reject) => {
    execFile('hermes', ['kanban', 'list', '--status', 'done', '--json'], {
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

/** 未认领开放卡接线（card.unassigned-stale 面）：ready+todo 两查合并，fail-soft。
 *  run20 r3 派单断棒实录：主卡 ready+无人认领 2h45m 全检测器盲区。 */
function unassignedCardsProvider(): (() => Promise<Array<Record<string, unknown>>>) | undefined {
  const list = (status: string) => new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
    execFile('hermes', ['kanban', 'list', '--status', status, '--json'], {
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
  return async () => [...await list('ready'), ...await list('todo')]
}

/** 期望工作卡接线（work.expected-silent 面，run20 双盲区实录）：遍历各板 kanban.db
 *  聚合 ready/todo 卡（含 assignee 非空卡——群消息派活形态下卡全是 ready +
 *  assignee=<名>-agent，CLI list 只查当前板拿不到，必须直读板库），fail-soft。
 *  直读走 node:sqlite（Node 内置）而非 sqlite3 CLI——studio 进程的 PATH 不含
 *  sqlite3（mx-lib ensure_studio_up 的 PATH 只到 /opt/homebrew/opt/ 无 bin 子目录），
 *  execFile('sqlite3') 全板失败被单板 catch 吞掉→面恒空→检测器零触发（run20 17:2x 实锤）。 */
function expectedWorkCardsProvider(): (() => Promise<Array<Record<string, unknown>>>) | undefined {
  const home = () => process.env.HERMES_HOME || hermesHomeDefault()
  return async () => {
    const { readdirSync } = await import('node:fs')
    const { join } = await import('node:path')
    let boards: string[] = []
    try { boards = readdirSync(join(home(), 'kanban', 'boards'), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) } catch { return [] }
    if (boards.length === 0) return []
    let DatabaseSync: typeof import('node:sqlite').DatabaseSync
    try { ({ DatabaseSync } = await import('node:sqlite')) } catch { return [] }
    const boardsDir = join(home(), 'kanban', 'boards')
    const out: Array<Record<string, unknown>> = []
    const errs: string[] = []
    const q = `SELECT id,title,assignee,status,body,created_at,updated_at FROM tasks WHERE status='ready' OR status='todo'`
    for (const b of boards) {
      let db: InstanceType<typeof DatabaseSync> | null = null
      try {
        // 不传 readOnly：本仓 node 版本不接受该选项（抛错→整面恒空）。
        db = new DatabaseSync(join(boardsDir, b, 'kanban.db'))
        for (const r of db.prepare(q).all() as Array<Record<string, unknown>>) out.push({ ...r, board: b })
      } catch (e) { errs.push(`${b}:${(e as Error).message.slice(0, 80)}`) }
      finally { try { db?.close() } catch { /* noop */ } }
    }
    // 采集可观测性（run20 批2.2 排查：期望对账 0 触发需采集面证据）
    console.error(`[clusterinspector] expectedWorkCards 采集: ${out.length} 卡 / ${boards.length} 板 / 失败[${errs.length}] ${errs.slice(0, 2).join(' | ')}`)
    return out
  }
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

/** 交付分支推送情报接线（delivery.pushed 面，V8.33 持续集成）：CLUSTER_INSPECTOR_NUDGE_REPO
 *  仓内 refs/heads/feat/* 本地 tip vs origin 同名 tip 比对——本地新于 origin（或 origin
 *  缺席）=未推送，owner 取该 tip 的 commit author 名（fail-soft）。git 失败=空数组。 */
function deliveryBranchIntelProvider(): (() => Promise<Array<{ branch: string; localTip: string; originTip: string; pushed: boolean; profile: string }>>) | undefined {
  const repo = process.env.CLUSTER_INSPECTOR_NUDGE_REPO
  if (!repo) return undefined
  const { execFileSync } = require('node:child_process') as typeof import('node:child_process')
  const git = (args: string[]): string => {
    return execFileSync('git', ['-C', repo, ...args], { timeout: 10_000, encoding: 'utf-8' }) as string
  }
  return async () => {
    try {
      const local = git(['for-each-ref', '--format=%(refname:short) %(objectname)', 'refs/heads/feat/']).trim().split('\n').filter(Boolean)
      if (local.length === 0) return []
      const out: Array<{ branch: string; localTip: string; originTip: string; pushed: boolean; profile: string }> = []
      for (const line of local) {
        const [branch, tip] = line.split(' ')
        if (!branch || !tip) continue
        let originTip = ''
        try { originTip = git(['rev-parse', `origin/${branch}`]).trim() } catch { originTip = '' }
        if (originTip === tip) continue // 已推（含同步）
        const author = (() => { try { return git(['log', '-1', '--format=%an', tip]).trim() } catch { return '' } })()
        out.push({ branch, localTip: tip, originTip, pushed: false, profile: author })
      }
      return out
    } catch { return [] }
  }
}

const insp = ensureInspector({ getKanbanDiagnostics: kanbanDiagnosticsProvider(), getRunningCards: runningCardsProvider(), getBlockedCards: blockedCardsProvider(), getFailedVerdictCards: failedVerdictCardsProvider(), getUnassignedCards: unassignedCardsProvider(), getExpectedWorkCards: expectedWorkCardsProvider(), getDeliveryBranchIntel: deliveryBranchIntelProvider(), getFederationSnapshot: federationSnapshotProvider(), ...deps })

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

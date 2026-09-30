// overlay/custom/server/services/hermes/command-post.ts
//
// 指挥中心装配模块（2.13）：
//   - initCommandPost(deps)：由 patch 196 在 bootstrap/routes.ts 受保护段
//     调用（先于 http.ts 的 WS 段），创建单例 { fleetRouter, overview, teams }。
//   - setupCommandPostWebSockets(servers, authDeps)：由 patch 197 在
//     bootstrap/http.ts 的 WS 段调用，挂舰队 WS + 看板聚合 WS。
//
// 依赖全部注入（custom 不 import upstream：symlink 真实路径陷阱，见
// controllers/hermes/trace.ts 注释）。

import type { Server as HttpServer } from 'http'
import { join } from 'node:path'
import { createFleetRouter } from '../../controllers/hermes/fleet'
import { createKanbanOverview } from './kanban-overview'
import { kanbanReadCache } from '../../middleware/kanban-read-cache'
import { createTeamsStore } from './teams-store'
import {
  buildFleetSnapshotFromTap,
  respondFleetApproval,
  respondFleetClarify,
} from './fleet-tap'
import { setupFleetWebSocket } from './fleet-events'

export interface CommandPostDeps {
  /** CLI 执行同源的 hermes 数据根（DI 注入——custom 树不直接 import 上游模块；
   *  函数形态=每次调用解析，跟随执行环境 HERMES_HOME） */
  resolveKanbanDir?: () => string
  listBoards: (opts?: { includeArchived?: boolean }) => Promise<any[]>
  listTasks: (opts?: { board?: string; includeArchived?: boolean }) => Promise<any[]>
  watchEvents: (opts?: { board?: string; interval?: number }) => any
  killWatch: (pid: number | undefined, fallbackKill: () => void) => void
  getSession: (sessionId: string) => any
  userCanAccessProfile: (userId: number, profile: string) => boolean
}

export interface CommandPostWebSockets {
  close(): Promise<void>
  forceClose(): void
}

interface CommandPostSingleton {
  fleetRouter: ReturnType<typeof createFleetRouter>
  overview: ReturnType<typeof createKanbanOverview>
  teams: ReturnType<typeof createTeamsStore>
}

let singleton: CommandPostSingleton | null = null

export function initCommandPost(deps: CommandPostDeps): CommandPostSingleton {
  if (singleton) return singleton
  const overview = createKanbanOverview({
    listBoards: deps.listBoards,
    listTasks: deps.listTasks,
    watchEvents: deps.watchEvents,
    killWatch: deps.killWatch,
    // sqlite 直读快道数据根（2026-09-28 性能根治：29 板 × python CLI ≈55s → <100ms）。
    // 性能批二轮（2026-09-30）：改函数动态解析——活动 profile 可切换，静态初值会
    // 指向默认 profile 的空库（实测主库 0 字节 → 快道整体回落 CLI → overview 19.5s）。
    kanbanDir: deps.resolveKanbanDir,
  })
  // 性能批二轮（2026-09-30）：板级 WS 事件 → 看板读缓存即时失效——agent 侧写
  // 看板（不经本进程 API）不再受 TTL 陈旧窗口约束（TTL 只兜底 watcher 空闲板）
  overview.onBoardEvent(() => kanbanReadCache.flush())
  const teams = createTeamsStore()
  const fleetRouter = createFleetRouter({
    buildSnapshot: buildFleetSnapshotFromTap,
    respondApproval: respondFleetApproval,
    respondClarify: respondFleetClarify,
    getSession: deps.getSession,
    getOverview: overview.getOverview,
    teams,
    userCanAccessProfile: deps.userCanAccessProfile,
  })
  singleton = { fleetRouter, overview, teams }
  return singleton
}

export function getCommandPost(): CommandPostSingleton | null {
  return singleton
}

export function setupCommandPostWebSockets(
  httpServers: HttpServer | HttpServer[],
  authDeps: {
    isAuthEnabled: () => Promise<boolean>
    authenticateUserToken: (token: string) => Promise<any>
    userCanAccessProfile: (userId: number, profile: string) => boolean
  },
): CommandPostWebSockets {
  const fleet = setupFleetWebSocket(httpServers, {
    buildSnapshot: buildFleetSnapshotFromTap,
    isAuthEnabled: authDeps.isAuthEnabled,
    authenticateUserToken: authDeps.authenticateUserToken,
    userCanAccessProfile: authDeps.userCanAccessProfile,
  })
  const current = singleton
  if (current) {
    current.overview.attachWebSocket(httpServers, {
      isAuthEnabled: authDeps.isAuthEnabled,
      authenticateUserToken: authDeps.authenticateUserToken,
    })
  }
  return {
    close: async () => {
      await fleet.close()
      await current?.overview.stop()
    },
    forceClose: () => {
      fleet.forceClose()
      void current?.overview.stop()
    },
  }
}

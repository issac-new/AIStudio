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
import { createFleetRouter } from '../../controllers/hermes/fleet'
import { createKanbanOverview } from './kanban-overview'
import { createTeamsStore } from './teams-store'
import {
  buildFleetSnapshotFromTap,
  respondFleetApproval,
  respondFleetClarify,
} from './fleet-tap'
import { setupFleetWebSocket } from './fleet-events'

export interface CommandPostDeps {
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
  })
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

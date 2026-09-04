// overlay/custom/server/services/hermes/kanban-overview.ts
//
// 看板服务端聚合（治 E1/E9）：
//   - getOverview()：一次返回全部 board + 全部任务（board 级 10s 缓存 +
//     in-flight 去重），客户端不再 N+1 拉 listTasks。
//   - 共享 watcher：每个 board 至多一个 `hermes kanban watch` 子进程（引用
//     计数），事件扇出到 overview WS 订阅者并使对应 board 缓存失效；
//     无订阅者 5 分钟后自动回收，避免子进程泄漏。
//
// 依赖（listBoards/listTasks/watchEvents/killWatch）由 patch 196 从
// routes.ts 注入（upstream kanban-service），保持 custom 不 import upstream。

import { WebSocketServer } from 'ws'
import type { Server as HttpServer, IncomingMessage } from 'http'
import type { Duplex } from 'stream'

export interface KanbanOverviewDeps {
  listBoards: (opts?: { includeArchived?: boolean }) => Promise<any[]>
  listTasks: (opts?: { board?: string; includeArchived?: boolean }) => Promise<any[]>
  watchEvents: (opts?: { board?: string; interval?: number }) => { pid?: number; kill: () => void; stdout?: { on: (event: string, cb: (chunk: any) => void) => void } }
  killWatch: (pid: number | undefined, fallbackKill: () => void) => void
  boardTtlMs?: number
  boardsTtlMs?: number
  idleWatcherMs?: number
}

export interface KanbanOverviewResult {
  boards: Array<{ slug: string; name: string; total: number; archived: boolean }>
  tasks: Array<{ board: string; task: any }>
  fetchedAt: number
}

interface BoardCacheEntry {
  tasks: any[]
  ts: number
  inflight: Promise<any[]> | null
}

type Listener = (board: string) => void

export function createKanbanOverview(deps: KanbanOverviewDeps) {
  const boardTtlMs = deps.boardTtlMs ?? 10_000
  const boardsTtlMs = deps.boardsTtlMs ?? 60_000
  const idleWatcherMs = deps.idleWatcherMs ?? 300_000

  let boardsCache: { boards: any[]; ts: number; inflight: Promise<any[]> | null } | null = null
  const boardCache = new Map<string, BoardCacheEntry>()
  const watchers = new Map<string, { pid?: number; kill: () => void; refs: number; lastEventAt: number; lastLine: string }>()
  const listeners = new Set<Listener>()

  function listBoardsCached(): Promise<any[]> {
    const now = Date.now()
    if (boardsCache && now - boardsCache.ts < boardsTtlMs) return Promise.resolve(boardsCache.boards)
    if (boardsCache?.inflight) return boardsCache.inflight
    const inflight = deps.listBoards({ includeArchived: false })
      .then(boards => {
        boardsCache = { boards: boards || [], ts: Date.now(), inflight: null }
        return boardsCache.boards
      })
      .catch(err => {
        if (boardsCache) boardsCache.inflight = null
        throw err
      })
    boardsCache = { boards: boardsCache?.boards || [], ts: boardsCache?.ts || 0, inflight }
    return inflight
  }

  function listTasksCached(board: string): Promise<any[]> {
    const cached = boardCache.get(board)
    const now = Date.now()
    if (cached && now - cached.ts < boardTtlMs) return Promise.resolve(cached.tasks)
    if (cached?.inflight) return cached.inflight
    const inflight = deps.listTasks({ board, includeArchived: true })
      .then(tasks => {
        boardCache.set(board, { tasks: tasks || [], ts: Date.now(), inflight: null })
        return tasks || []
      })
      .catch(err => {
        const entry = boardCache.get(board)
        if (entry) entry.inflight = null
        throw err
      })
    if (cached) {
      cached.inflight = inflight
    } else {
      boardCache.set(board, { tasks: [], ts: 0, inflight })
    }
    return inflight
  }

  function invalidateBoard(board: string): void {
    const entry = boardCache.get(board)
    if (entry) entry.ts = 0
  }

  function notify(board: string): void {
    for (const listener of listeners) {
      try {
        listener(board)
      } catch {
        /* 单个监听者异常不影响其他 */
      }
    }
  }

  function ensureWatcher(board: string): void {
    const existing = watchers.get(board)
    if (existing) {
      existing.refs += 1
      return
    }
    const child = deps.watchEvents({ board, interval: 0.5 })
    const record = { pid: child.pid, kill: () => deps.killWatch(child.pid, () => child.kill()), refs: 1, lastEventAt: Date.now(), lastLine: '' }
    watchers.set(board, record)
    child.stdout?.on('data', (chunk: any) => {
      record.lastEventAt = Date.now()
      const text = String(chunk || '')
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (!trimmed) continue
        if (trimmed.toLowerCase().startsWith('watching kanban events')) continue
        record.lastLine = trimmed
        invalidateBoard(board)
        notify(board)
      }
    })
  }

  function releaseWatcher(board: string): void {
    const record = watchers.get(board)
    if (!record) return
    record.refs = Math.max(0, record.refs - 1)
    maybeReapWatchers()
  }

  function maybeReapWatchers(): void {
    const now = Date.now()
    for (const [board, record] of watchers) {
      if (record.refs > 0) continue
      if (now - record.lastEventAt < idleWatcherMs) continue
      try {
        record.kill()
      } catch {
        /* 已退出 */
      }
      watchers.delete(board)
    }
  }

  async function getOverview(): Promise<KanbanOverviewResult> {
    const boards = await listBoardsCached()
    const results = await Promise.allSettled(boards.map(board => listTasksCached(board.slug)))
    const tasks: Array<{ board: string; task: any }> = []
    boards.forEach((board, index) => {
      const result = results[index]
      if (result.status === 'fulfilled') {
        for (const task of result.value || []) tasks.push({ board: board.slug, task })
      }
    })
    return {
      boards: boards.map(board => ({
        slug: board.slug,
        name: board.name,
        total: Number(board.total ?? 0),
        archived: Boolean(board.archived),
      })),
      tasks,
      fetchedAt: Date.now(),
    }
  }

  // ── overview WebSocket：单连接推全部 board 事件（不再每连接一个 watch 子进程）──

  interface OverviewClient {
    send: (payload: string) => void
    close: () => void
    terminate: () => void
    readyState: number
  }

  let wss: WebSocketServer | null = null
  const clients = new Set<{ raw: OverviewClient }>()
  const upgradeHandlers: Array<(req: IncomingMessage, socket: Duplex, head: Buffer) => void> = []

  function broadcast(board: string): void {
    if (!wss || clients.size === 0) return
    const payload = JSON.stringify({ type: 'board-event', board, ts: Date.now() })
    for (const client of clients) {
      try {
        if (client.raw.readyState === 1) client.raw.send(payload)
      } catch {
        clients.delete(client)
      }
    }
  }

  function attachWebSocket(
    httpServers: HttpServer | HttpServer[],
    auth: {
      isAuthEnabled: () => Promise<boolean>
      authenticateUserToken: (token: string) => Promise<unknown>
    },
  ): void {
    if (wss) return
    wss = new WebSocketServer({ noServer: true })
    const servers = Array.isArray(httpServers) ? httpServers : [httpServers]
    const onUpgrade = async (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      const url = new URL(req.url || '/', 'http://localhost')
      if (url.pathname !== '/api/hermes/kanban/overview/events') return
      if (await auth.isAuthEnabled()) {
        const token = url.searchParams.get('token') || ''
        const user = await auth.authenticateUserToken(token)
        if (!user) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
          socket.destroy()
          return
        }
      }
      wss!.handleUpgrade(req, socket, head, ws => {
        const client = { raw: ws as unknown as OverviewClient }
        clients.add(client)
        ws.on('close', () => {
          clients.delete(client)
          maybeReapWatchers()
        })
        ws.on('error', () => clients.delete(client))
        try {
          ws.send(JSON.stringify({ type: 'connected' }))
        } catch {
          /* 忽略 */
        }
        // 该连接关心全部 board：预热的 watcher 集合在首个事件到达时按 board 建齐
        for (const board of boardCache.keys()) ensureWatcher(board)
      })
    }
    servers.forEach(server => server.on('upgrade', onUpgrade))
    upgradeHandlers.push(onUpgrade)
    listeners.add(broadcast)
    // 空闲回收定时器
    const reaper = setInterval(maybeReapWatchers, 60_000)
    reaper.unref?.()
  }

  async function stop(): Promise<void> {
    listeners.delete(broadcast)
    for (const [, record] of watchers) {
      try {
        record.kill()
      } catch {
        /* 忽略 */
      }
    }
    watchers.clear()
    for (const client of clients) {
      try {
        client.raw.terminate()
      } catch {
        /* 忽略 */
      }
    }
    clients.clear()
    if (wss) {
      await new Promise<void>(resolve => wss!.close(() => resolve()))
      wss = null
    }
  }

  return {
    getOverview,
    invalidateBoard,
    ensureWatcher,
    releaseWatcher,
    attachWebSocket,
    stop,
    /** 仅测试用：内部 watcher 计数 */
    _watcherCount: () => watchers.size,
  }
}

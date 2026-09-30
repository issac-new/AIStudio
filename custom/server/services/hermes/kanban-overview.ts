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
//
// 2026-09-28 性能根治（推演走查实锤：冷缓存 29 板 × python CLI 启动 ≈55s，
// 驾驶舱顶栏"任务 0"）：新增 sqlite 直读快道——boards/<slug>/kanban.db 只读
// 查询（与 CLI 同一存储、同一 rows），29 板从 ~55s 降至 <100ms；任一板失败
// 静默回落该板的 CLI 老路径，语义零变更。

import { WebSocketServer } from 'ws'
import type { Server as HttpServer, IncomingMessage } from 'http'
import type { Duplex } from 'stream'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface KanbanOverviewDeps {
  listBoards: (opts?: { includeArchived?: boolean }) => Promise<any[]>
  listTasks: (opts?: { board?: string; includeArchived?: boolean }) => Promise<any[]>
  watchEvents: (opts?: { board?: string; interval?: number }) => { pid?: number; kill: () => void; stdout?: { on: (event: string, cb: (chunk: any) => void) => void } }
  killWatch: (pid: number | undefined, fallbackKill: () => void) => void
  boardTtlMs?: number
  boardsTtlMs?: number
  idleWatcherMs?: number
  /** sqlite 直读快道的 kanban 数据根（含 boards/ 子目录与主库 kanban.db）。
   *  不传 = 快道关闭，纯 CLI 老路径（测试默认）。生产由 command-post 注入。 */
  /** sqlite 直读快道数据根；函数形态=每次调用动态解析（活动 profile 可切换） */
  kanbanDir?: string | (() => string)
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
  // 性能批二轮（2026-09-30）：板级事件对外订阅（看板读缓存 flush 等）
  const boardEventCallbacks = new Set<(board: string) => void>()

  // ── sqlite 直读快道（2026-09-28 性能根治；性能批二轮 2026-09-30 布局修正）──
  // 与 CLI 同一存储。kanbanDir=HERMES home：主库 <home>/kanban.db（default 板，
  // 102 任务实测在根级；旧布局 <home>/kanban/kanban.db 兜底）+ 分板
  // <home>/kanban/boards/<slug>/kanban.db（旧布局 <home>/boards 兜底）。
  // 只读打开、用完即关，失败一律返回 null 由调用方回落 CLI 老路径。
  // deps.kanbanDir 未给 = 快道关。
  function queryBoardDb<T = any>(dbPath: string, fn: (db: any) => T): T | null {
    let db: any = null
    try {
      // node:sqlite 按需加载（node ≥22.5；老版本 node 直接走回落）
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { DatabaseSync } = require('node:sqlite')
      db = new DatabaseSync(dbPath, { readOnly: true })
      return fn(db)
    } catch {
      return null
    } finally {
      try { db?.close() } catch { /* 已关 */ }
    }
  }

  /** 布局候选解析（性能批二轮）：主库/分板目录按现行→旧布局依次探测 */
  function fastMainDb(home: string): string | null {
    const p1 = join(home, 'kanban.db')
    if (existsSync(p1)) return p1
    const p2 = join(home, 'kanban', 'kanban.db')
    return existsSync(p2) ? p2 : null
  }
  function fastBoardsDir(home: string): string | null {
    const p1 = join(home, 'kanban', 'boards')
    if (existsSync(p1)) return p1
    const p2 = join(home, 'boards')
    return existsSync(p2) ? p2 : null
  }

  /** 快道 boards 列表：default（主库）+ boards/<slug>/（board.json + tasks 计数）。失败返回 null。 */
  function listBoardsFast(): any[] | null {
    const home = typeof deps.kanbanDir === 'function' ? deps.kanbanDir() : deps.kanbanDir
    if (!home) return null
    const boardsDir = fastBoardsDir(home)
    if (!boardsDir) return null
    try {
      const out: any[] = []
      const mainDb = fastMainDb(home)
      if (mainDb) {
        const total = queryBoardDb(mainDb, db => (db.prepare('select count(*) n from tasks').get() as any)?.n ?? 0)
        if (total === null) return null // 主库读不了 → 整体回落（与分板语义一致，防"Default 板 0 任务"假象）
        out.push({ slug: 'default', name: 'Default', total, archived: false })
      }
      for (const slug of readdirSync(boardsDir)) {
        // 下划线前缀=特殊/归档目录（_archive 等）与 default 残根（真 default
        // 数据在根级主库 <home>/kanban.db；boards/default/ 是 0 字节历史残根，
        // 其库不可读会误触「任一板读不了→整体回落」，实测快道因此全关——
        // 性能批二轮）
        if (slug.startsWith('_') || slug === 'default') continue
        const dbPath = join(boardsDir, slug, 'kanban.db')
        if (!existsSync(dbPath)) continue
        let name = slug
        let archived = false
        try {
          const meta = JSON.parse(readFileSync(join(boardsDir, slug, 'board.json'), 'utf8'))
          name = meta.name || slug
          archived = Boolean(meta.archived)
        } catch { /* board.json 缺失时用 slug */ }
        const total = queryBoardDb(dbPath, db => (db.prepare('select count(*) n from tasks').get() as any)?.n ?? 0)
        if (total === null) return null // 该板读不了 → 整体回落，保证语义一致
        out.push({ slug, name, total, archived })
      }
      return out.length ? out : null
    } catch {
      return null
    }
  }

  /** 快道单板任务：tasks 全行（CLI 同款 rows）。板库不存在或读失败返回 null。 */
  function listTasksFast(board: string): any[] | null {
    const home = typeof deps.kanbanDir === 'function' ? deps.kanbanDir() : deps.kanbanDir
    if (!home) return null
    const dbPath = board === 'default'
      ? fastMainDb(home)
      : (() => { const d = fastBoardsDir(home); return d ? join(d, board, 'kanban.db') : null })()
    if (!dbPath || !existsSync(dbPath)) return board === 'default' ? [] : null
    return queryBoardDb(dbPath, db =>
      db.prepare('select * from tasks').all().map((row: any) => ({ ...row, board })),
    )
  }

  function listBoardsCached(): Promise<any[]> {
    const now = Date.now()
    if (boardsCache && now - boardsCache.ts < boardsTtlMs) return Promise.resolve(boardsCache.boards)
    if (boardsCache?.inflight) return boardsCache.inflight
    const fast = listBoardsFast()
    const source = fast ? Promise.resolve(fast) : deps.listBoards({ includeArchived: false })
    const inflight = source
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
    const fast = listTasksFast(board)
    const source = fast ? Promise.resolve(fast) : deps.listTasks({ board, includeArchived: true })
    const inflight = source
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
    // 板级失效连带作废整结果缓存（事件到达时结果必已过期）
    overviewResult = null
    // 性能批二轮（2026-09-30）：对外失效回调（如看板读缓存 flush）——
    // agent 侧写看板经板级 watcher 事件近实时失效，读缓存 TTL 只兜底
    for (const cb of boardEventCallbacks) {
      try { cb(board) } catch { /* 单个回调异常不阻塞 */ }
    }
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
    // 性能批二轮（2026-09-30）：同一板事件（agent 心跳/锁续期等高频写）逐行
    // 失效+广播会把下游全量刷新逐次打到冷 CLI——每板 2s 合并一次失效/广播；
    // 板级缓存 TTL 10s 与读缓存 TTL 仍兜底新鲜度上限。
    const EVENT_MERGE_MS = 2_000
    let lastNotifyAt = 0
    let mergeTimer: ReturnType<typeof setTimeout> | null = null
    const flushBoardEvent = (): void => {
      lastNotifyAt = Date.now()
      invalidateBoard(board)
      notify(board)
    }
    child.stdout?.on('data', (chunk: any) => {
      record.lastEventAt = Date.now()
      const text = String(chunk || '')
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (!trimmed) continue
        if (trimmed.toLowerCase().startsWith('watching kanban events')) continue
        record.lastLine = trimmed
        const now = Date.now()
        if (now - lastNotifyAt >= EVENT_MERGE_MS) {
          flushBoardEvent()
          continue
        }
        if (mergeTimer) clearTimeout(mergeTimer)
        mergeTimer = setTimeout(() => {
          mergeTimer = null
          flushBoardEvent()
        }, lastNotifyAt + EVENT_MERGE_MS - now)
        mergeTimer.unref?.()
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

  // 整结果缓存（2026-09-30 性能批）：客户端武装一次会发两路 overview
  // （cockpit/teams-adapter 与 workspace 各一），冷启动 boards→tasks 两跳 CLI
  // 实测 9s+——结果级 single-flight + 短 TTL 把并发与紧邻重复压成一次；
  // 板级事件失效（invalidateBoard）会连带作废。
  let overviewResult: { value: KanbanOverviewResult; ts: number } | null = null
  let overviewInflight: Promise<KanbanOverviewResult> | null = null
  const OVERVIEW_RESULT_TTL_MS = 3_000

  async function getOverview(): Promise<KanbanOverviewResult> {
    if (overviewResult && Date.now() - overviewResult.ts < OVERVIEW_RESULT_TTL_MS) {
      return overviewResult.value
    }
    if (overviewInflight) return overviewInflight
    overviewInflight = (async () => {
      const boards = await listBoardsCached()
      const results = await Promise.allSettled(boards.map(board => listTasksCached(board.slug)))
      const tasks: Array<{ board: string; task: any }> = []
      boards.forEach((board, index) => {
        const result = results[index]
        if (result.status === 'fulfilled') {
          for (const task of result.value || []) tasks.push({ board: board.slug, task })
        }
      })
      const value: KanbanOverviewResult = {
        boards: boards.map(board => ({
          slug: board.slug,
          name: board.name,
          total: Number(board.total ?? 0),
          archived: Boolean(board.archived),
        })),
        tasks,
        fetchedAt: Date.now(),
      }
      overviewResult = { value, ts: Date.now() }
      return value
    })()
    try {
      return await overviewInflight
    } finally {
      overviewInflight = null
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
  // boards=该连接 ensure 过的板（close 时逐板 release——refs 只增不减会让空闲回收器
  // 被 refs>0 永久短路，watch 子进程到 stop() 前不回收，"无订阅者自动回收"承诺失效）
  const clients = new Set<{ raw: OverviewClient; boards: string[] }>()
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
        const client = { raw: ws as unknown as OverviewClient, boards: [] as string[] }
        clients.add(client)
        ws.on('close', () => {
          clients.delete(client)
          for (const b of client.boards) releaseWatcher(b)
          maybeReapWatchers()
        })
        // 只摘除不 release：error 后必随 close，close 是唯一释放点（避免双重扣减）
        ws.on('error', () => clients.delete(client))
        try {
          ws.send(JSON.stringify({ type: 'connected' }))
        } catch {
          /* 忽略 */
        }
        // 该连接关心全部 board：预热的 watcher 集合在首个事件到达时按 board 建齐
        for (const board of boardCache.keys()) {
          client.boards.push(board)
          ensureWatcher(board)
        }
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
    /** 板级事件订阅（watcher 收到任一 board 事件即回调；返回退订函数） */
    onBoardEvent(cb: (board: string) => void): () => void {
      boardEventCallbacks.add(cb)
      return () => boardEventCallbacks.delete(cb)
    },
    ensureWatcher,
    releaseWatcher,
    attachWebSocket,
    stop,
    /** 仅测试用：内部 watcher 计数 */
    _watcherCount: () => watchers.size,
  }
}

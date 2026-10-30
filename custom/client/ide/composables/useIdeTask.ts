// overlay/custom/client/ide/composables/useIdeTask.ts
// IDE 任务读模型：getTask 详情优先，看板列表只补 board slug / session_id。
//
// 背景（2026-10-18 回归）：listTasks 默认过滤 done/archived，已归档任务的
// ?task= 深链在逐板扫描里永远命中不了；getTask 详情本来已经返回任务，却被
// 丢弃去扫板。这里把「详情先回填 → 板提示后补」收成一个可缓存、可去重的读模型。
import { getTask, listBoards, listTasks } from '@/api/hermes/kanban'
import { looksLikeTaskNumber, titleMatchesTaskNumber } from './useIdeFallback'

export interface IdeTaskSnapshot {
  id: string
  title: string
  status: string
  priority?: number
  assignee?: string | null
  body?: string | null
  raci?: Record<string, string[]> | null
  workspacePath?: string | null
  parents?: string[]
  children?: string[]
  sessionId?: string | null
}

export interface IdeTaskResolution {
  task: IdeTaskSnapshot | null
  board: string | null
  notFound: boolean
  /** 命中方式：卡 id 直查 / 任务号标题前缀解析（兜底视图据此如实标注）。 */
  resolvedBy?: 'id' | 'task_number'
  /** 瞬时失败（详情超时/5xx/网络）：解析故障，不等于任务不存在。 */
  transientError?: boolean
}

interface DetailShape {
  task?: {
    id?: string; title?: string; status?: string; priority?: number
    assignee?: string | null; body?: string | null
    raci?: Record<string, string[]> | null; workspace_path?: string | null
    session_id?: string | null
    parents?: string[]; children?: string[]
  }
  session?: { id?: string } | null
  parents?: string[]
  children?: string[]
}

const CACHE_TTL_MS = 30_000

export function useIdeTask() {
  const cache = new Map<string, { at: number; value: IdeTaskResolution }>()
  const inflight = new Map<string, Promise<IdeTaskResolution>>()

  function fromDetail(detail: DetailShape | null): IdeTaskSnapshot | null {
    const task = detail?.task
    if (!task?.id) return null
    return {
      id: task.id,
      title: task.title ?? '',
      status: task.status ?? '',
      priority: typeof task.priority === 'number' ? task.priority : undefined,
      assignee: task.assignee ?? null,
      body: task.body ?? null,
      raci: task.raci ?? null,
      workspacePath: task.workspace_path ?? null,
      parents: detail?.parents ?? task.parents ?? [],
      children: detail?.children ?? task.children ?? [],
      sessionId: detail?.session?.id ?? task.session_id ?? null,
    }
  }

  /** 看板列表项 → 简报快照（字段名归一；详情/列表两路共用，避免两处漂移）。 */
  function snapshotOf(hit: {
    id: string; title: string; status: string; priority?: unknown; assignee?: unknown
    body?: unknown; raci?: unknown; workspace_path?: unknown; parents?: unknown; children?: unknown; session_id?: unknown
  }): IdeTaskSnapshot {
    return {
      id: hit.id,
      title: hit.title,
      status: hit.status,
      priority: typeof hit.priority === 'number' ? hit.priority : undefined,
      assignee: (hit.assignee as string | null | undefined) ?? null,
      body: (hit.body as string | null | undefined) ?? null,
      raci: (hit.raci as Record<string, string[]> | null | undefined) ?? null,
      workspacePath: (hit.workspace_path as string | null | undefined) ?? null,
      parents: (hit.parents as string[] | undefined) ?? [],
      children: (hit.children as string[] | undefined) ?? [],
      sessionId: (hit.session_id as string | null | undefined) ?? null,
    }
  }

  async function readUncached(
    id: string,
    onTask?: (task: IdeTaskSnapshot) => void,
    onBoard?: (board: string) => void,
  ): Promise<IdeTaskResolution> {
    let detail: DetailShape | null = null
    let notFound = false
    try {
      // 详情端点无超时；深链卡在「解析中」比给不出结论更糟（2026-10-30 走查实锤：
      // 串行逐板扫描 + 卡死请求把兜底视图冻在「正在解析」20s+）。8s 后按瞬时失败处理。
      detail = await withTimeout<DetailShape | null>(getTask(id) as Promise<DetailShape>, 8000)
    } catch (err) {
      const e = err as { status?: number; message?: string }
      notFound = e?.status === 404 || /\b404\b|not found/i.test(String(e?.message ?? ''))
      if (notFound) {
        // 任务号兜底（2026-10-30 run23 复盘续作）：看板详情端点只认卡 id，
        // 用户从任务卡/群里复制的常是任务号（DEV-CHWX-S1）。只在 id 形如任务号时
        // 逐板按标题前缀解析，防把任意 404 id 都拿去撞标题。
        const byNumber = looksLikeTaskNumber(id) ? await findByTaskNumber(id) : null
        if (byNumber) {
          onTask?.(byNumber.task)
          return { task: byNumber.task, board: byNumber.board, notFound: false, resolvedBy: 'task_number' }
        }
        return { task: null, board: null, notFound: true }
      }
    }

    const task = fromDetail(detail)
    // 详情先回填：抽屉/兜底视图立刻可渲染，不等看板提示（31 板扫描只影响「看板」
    // 字段与相对 workspace_path 的锚定；绝对路径无需板号）。
    if (task) onTask?.(task)

    if (task) {
      // 板号优先从绝对 workspace_path 推出（…/boards/<slug>/workspaces/<task>）——
      // 零请求、零后台扫描，避免大批 listTasks 与 task-workspace 自请求抢后端。
      const derived = boardFromWorkspacePath(task.workspacePath)
      if (derived) return { task, board: derived, notFound: false, resolvedBy: 'id' }
      // 绝对路径但没有板段（如 /workspaces/<user>/<repo>）：板号对路径解析无意义，
      // 不扫板；相对路径才需要板号锚定，后台低频补（不阻塞 resolve）。
      if (!task.workspacePath?.trim().startsWith('/')) {
        void findBoardForTask(id).then((board) => {
          if (board) onBoard?.(board)
        })
      }
      return { task, board: null, notFound: false, resolvedBy: 'id' }
    }

    // 详情瞬时失败（超时/5xx/网络，非 404）：任务号先按标题前缀有界解析；
    // 卡 id 再按 id 逐板救一次。都未命中时：任务号=如实 not_found（用户给号，
    // 没有卡以该号开头）；卡 id=transientError（解析故障，不冒充「任务在但未物化」）。
    if (looksLikeTaskNumber(id)) {
      const byNumber = await findByTaskNumber(id)
      if (byNumber) {
        onTask?.(byNumber.task)
        return { task: byNumber.task, board: byNumber.board, notFound: false, resolvedBy: 'task_number' }
      }
      return { task: null, board: null, notFound: true }
    }
    const hit = await scanBoardsFor(async (slug) => {
      const list = await listTasks({ board: slug }).catch(() => [])
      const candidate = list.find(c => c.id === id || c.session_id === id)
      return candidate ? { slug, candidate } : null
    })
    if (hit) {
      const taskHit = snapshotOf(hit.candidate)
      return { task: taskHit, board: hit.slug, notFound: false, resolvedBy: 'id' }
    }

    return { task: null, board: null, notFound: false, transientError: true }
  }

  /** 从任务 workspace_path 推出板 slug（服务端约定 …/boards/<slug>/workspaces/…）。 */
  function boardFromWorkspacePath(path: string | null | undefined): string | null {
    const hit = /\/boards\/([^/]+)\/workspaces(?:\/|$)/.exec(path ?? '')
    if (!hit?.[1]) return null
    try { return decodeURIComponent(hit[1]) } catch { return hit[1] }
  }

  /** 超时兜底（不取消底层请求；调用方按 null/超时语义继续）。 */
  function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      p,
      new Promise<T>((resolve) => { setTimeout(() => resolve(null as T), ms) }),
    ])
  }

  /** 板号后台解析：有界并发 + 单板超时 + 总时限，命中即停（不阻塞 resolve）。 */
  async function findBoardForTask(id: string): Promise<string | null> {
    const hit = await scanBoardsFor(async (slug) => {
      const list = await listTasks({ board: slug }).catch(() => [])
      const candidate = list.find(c => c.id === id || c.session_id === id)
      return candidate ? { slug } : null
    }, { perBoardMs: 2500, totalMs: 30_000, concurrency: 3 })
    return hit?.slug ?? null
  }

  /**
   * 有界并发逐板扫描：并发 6、单板 2.5s 超时、总时限默认 6s；返回首个命中。
   * 背景板号解析放宽总时限（30s），任务号 not_found 判定用默认 6s 封顶。
   */
  async function scanBoardsFor<T>(
    fn: (slug: string) => Promise<T | null>,
    opts: { perBoardMs?: number; totalMs?: number; concurrency?: number } = {},
  ): Promise<T | null> {
    const perBoardMs = opts.perBoardMs ?? 2500
    const totalMs = opts.totalMs ?? 6000
    const concurrency = opts.concurrency ?? 6
    let boards: string[]
    try {
      boards = [...new Set((await withTimeout(listBoards(), 6000) ?? []).map(b => b.slug).filter(Boolean))] as string[]
    } catch {
      return null
    }
    // 默认板优先（多数任务号落在 default/当前板；检索顺序影响任务号命中时延）
    boards = [...boards.filter(b => b === 'default'), ...boards.filter(b => b !== 'default')]
    if (boards.length === 0) return null
    const results: Array<T | null> = new Array(boards.length).fill(null)
    let next = 0
    const worker = async (): Promise<void> => {
      while (next < boards.length) {
        const i = next++
        results[i] = await withTimeout(fn(boards[i]).catch(() => null), perBoardMs)
        if (results[i]) return // 命中即停（同 worker 不再取板）
      }
    }
    const all = Promise.all(Array.from({ length: Math.min(concurrency, boards.length) }, worker))
    await Promise.race([all, new Promise<void>((resolve) => { setTimeout(resolve, totalMs) })])
    return results.find((r): r is T => r !== null) ?? null
  }

  /** 任务号 → 卡 id：逐板扫标题前缀（首个命中；标题前缀后须是非字母数字防 S1/S10 误配）。 */
  async function findByTaskNumber(number: string): Promise<{ task: IdeTaskSnapshot; board: string } | null> {
    const hit = await scanBoardsFor(async (slug) => {
      const list = await listTasks({ board: slug }).catch(() => [])
      const candidate = list.find(c => titleMatchesTaskNumber(String(c.title ?? ''), number))
      return candidate ? { task: snapshotOf(candidate), board: slug } : null
    }, { perBoardMs: 3000, totalMs: 12_000, concurrency: 8 })
    return hit
  }

  async function resolve(
    id: string,
    onTask?: (task: IdeTaskSnapshot) => void,
    onBoard?: (board: string) => void,
  ): Promise<IdeTaskResolution> {
    const cached = cache.get(id)
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      if (cached.value.task) onTask?.(cached.value.task)
      return cached.value
    }
    const pending = inflight.get(id)
    if (pending) return pending
    const promise = readUncached(id, onTask, (board) => {
      // 后台板号回填：缓存同步更新，后续复读不再显示「板待定」
      const hit = cache.get(id)
      if (hit?.value) hit.value.board = board
      onBoard?.(board)
    })
      .then((value) => {
        cache.set(id, { at: Date.now(), value })
        return value
      })
      .finally(() => { inflight.delete(id) })
    inflight.set(id, promise)
    return promise
  }

  function clear(id?: string): void {
    if (id) cache.delete(id)
    else cache.clear()
  }

  return { resolve, clear }
}

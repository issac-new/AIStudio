// overlay/custom/client/ide/composables/useIdeTask.ts
// IDE 任务读模型：getTask 详情优先，看板列表只补 board slug / session_id。
//
// 背景（2026-10-18 回归）：listTasks 默认过滤 done/archived，已归档任务的
// ?task= 深链在逐板扫描里永远命中不了；getTask 详情本来已经返回任务，却被
// 丢弃去扫板。这里把「详情先回填 → 板提示后补」收成一个可缓存、可去重的读模型。
import { getTask, listBoards, listTasks } from '@/api/hermes/kanban'

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

  async function readUncached(
    id: string,
    onTask?: (task: IdeTaskSnapshot) => void,
  ): Promise<IdeTaskResolution> {
    let detail: DetailShape | null = null
    let notFound = false
    try {
      detail = await getTask(id) as DetailShape
    } catch (err) {
      const e = err as { status?: number; message?: string }
      notFound = e?.status === 404 || /\b404\b|not found/i.test(String(e?.message ?? ''))
      if (notFound) return { task: null, board: null, notFound: true }
    }

    let task = fromDetail(detail)
    // 详情先回填：抽屉不必等串行逐板扫描
    if (task) onTask?.(task)

    // 板提示：listTasks 可见的执行态任务能命中；归档任务命中不了也不影响详情
    try {
      const boards = (await listBoards()).map(board => board.slug).filter(Boolean) as string[]
      const order = [...new Set(boards)]
      for (const slug of order) {
        const hit = (await listTasks({ board: slug }).catch(() => []))
          .find(candidate => candidate.id === id || candidate.session_id === id)
        if (!hit) continue
        task = {
          id: hit.id,
          title: hit.title,
          status: hit.status,
          priority: typeof hit.priority === 'number' ? hit.priority : undefined,
          assignee: (hit as { assignee?: string | null }).assignee ?? null,
          body: hit.body ?? null,
          raci: (hit as { raci?: Record<string, string[]> | null }).raci ?? null,
          workspacePath: (hit as { workspace_path?: string | null }).workspace_path ?? null,
          parents: (hit as { parents?: string[] }).parents ?? [],
          children: (hit as { children?: string[] }).children ?? [],
          sessionId: (hit as { session_id?: string | null }).session_id ?? null,
        }
        return { task, board: slug, notFound: false }
      }
    } catch { /* 板解析失败：详情已回填则保持 */ }

    return { task, board: null, notFound: false }
  }

  async function resolve(
    id: string,
    onTask?: (task: IdeTaskSnapshot) => void,
  ): Promise<IdeTaskResolution> {
    const cached = cache.get(id)
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      if (cached.value.task) onTask?.(cached.value.task)
      return cached.value
    }
    const pending = inflight.get(id)
    if (pending) return pending
    const promise = readUncached(id, onTask)
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

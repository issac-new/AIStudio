// overlay/custom/server/controllers/ide/task-workspace.ts
// 任务 workspace 解析端点（Ycode 工作区 ↔ kanban 任务关联轮，2026-10-18）：
//   GET /api/ide/task-workspace?task=<id>&board=<slug>
//     → { taskId, board, kind, path, materialized, branch, status, note }
//
// 为什么不客户端解析：task.workspace_path 可能是绝对路径（系统级任务在
// ~/.hermes 外），也可能是相对板 workspaces 根的路径——根目录（~/.hermes/
// kanban[/boards/<slug>]/workspaces）是服务端约定（同 upstream listWorkspaceFiles，
// controllers/hermes/kanban.ts），客户端不可信拼。本端点镜像同一解析约定。
//
// scratch 未派发（workspace_path 为空）时按 CLI resolve_workspace 语义预测
// `<workspacesRoot>/<task-id>`，materialized=false 如实告知（客户端不切换、
// 只展示）；dir/worktree 无路径不猜（board default_workdir 解析发生在派发时）。
//
// 挂载：B 类 patch（series 658）在 packages/server/src/bootstrap/routes.ts
// `app.use(ideTaskWorkspaceRoutes.routes())`，与 ide/worktree、ide/retry-counts
// 同款模式，继承全局 authMiddleware 链。任务详情经本机 HTTP 自请求获取
// （custom 控制器经符号链接挂载，不可相对 import upstream modules——软链真实
// 路径解析不到 src/modules，HTTP 自请求是唯一干净通道，worktree.ts 同款）。
import Router from '@koa/router'
import { homedir } from 'os'
import { isAbsolute, normalize, resolve } from 'path'
import { statSync } from 'fs'

export interface TaskWorkspaceInput {
  taskId: string
  board: string
  workspaceKind: string | null
  workspacePath: string | null
  branchName?: string | null
  status?: string | null
}

export type TaskWorkspaceNote = 'ok' | 'predicted_scratch' | 'no_workspace' | 'escape_refused'

export interface TaskWorkspaceResolution {
  taskId: string
  board: string
  /** workspace_kind（scratch/dir/worktree） */
  kind: string | null
  /** 绝对根路径；无法解析时 null */
  path: string | null
  /** 目录已存在（scratch 未派发 / 完成已回收 = false，如实呈现不编造） */
  materialized: boolean
  branch: string | null
  status: string | null
  note: TaskWorkspaceNote
}

/** 板 workspaces 根（镜像 upstream listWorkspaceFiles：~/.hermes/kanban 约定） */
export function boardWorkspacesRoot(kanbanHome: string, board: string): string {
  return board === 'default' || !board
    ? resolve(kanbanHome, 'workspaces')
    : resolve(kanbanHome, 'boards', board, 'workspaces')
}

/**
 * 纯解析（测试同源）：
 *  - 绝对 workspace_path → 直用（系统级任务可在 ~/.hermes 外，如项目仓库根）；
 *  - 相对 → 锚定板 workspaces 根；normalize 后逃出根（../ 穿越)=拒绝不猜；
 *  - 空 path + scratch → 预测 <workspacesRoot>/<task-id>（CLI resolve_workspace 同语义）；
 *  - 空 path + dir/worktree → no_workspace（不猜 board default_workdir）。
 */
export function resolveTaskWorkspace(
  input: TaskWorkspaceInput,
  deps: { kanbanHome: string; isDir: (p: string) => boolean },
): TaskWorkspaceResolution {
  const base: TaskWorkspaceResolution = {
    taskId: input.taskId,
    board: input.board,
    kind: input.workspaceKind,
    path: null,
    materialized: false,
    branch: input.branchName ?? null,
    status: input.status ?? null,
    note: 'no_workspace',
  }
  const root = boardWorkspacesRoot(deps.kanbanHome, input.board)
  let path: string | null = null
  if (input.workspacePath && input.workspacePath.trim()) {
    const raw = input.workspacePath.trim()
    path = isAbsolute(raw)
      ? resolve(normalize(raw))
      : resolve(root, normalize(raw))
    if (!isAbsolute(raw)) {
      const rel = normalize(raw)
      if (rel === '..' || rel.startsWith('../')) {
        return { ...base, note: 'escape_refused' }
      }
    }
  } else if (!input.workspaceKind || input.workspaceKind === 'scratch') {
    path = resolve(root, input.taskId)
  }
  if (!path) return base
  return {
    ...base,
    path,
    materialized: deps.isDir(path),
    note: input.workspacePath && input.workspacePath.trim() ? 'ok' : 'predicted_scratch',
  }
}

function kanbanHomeDir(): string {
  return resolve(homedir(), '.hermes', 'kanban')
}

interface TaskDetailShape {
  task?: {
    workspace_kind?: string | null
    workspace_path?: string | null
    branch_name?: string | null
    status?: string | null
  }
}

async function fetchTaskDetail(
  ctx: { get?: (k: string) => string },
  taskId: string,
  board: string,
): Promise<TaskDetailShape | null> {
  const token = typeof ctx.get === 'function' ? ctx.get('authorization') : ''
  const port = process.env.PORT || '8647'
  const q = board && board !== 'default' ? `?board=${encodeURIComponent(board)}` : ''
  const res = await fetch(
    `http://127.0.0.1:${port}/api/hermes/kanban/${encodeURIComponent(taskId)}${q}`,
    { headers: token ? { authorization: token } : {}, signal: AbortSignal.timeout(45_000) },
  )
  if (!res.ok) return null
  return (await res.json()) as TaskDetailShape
}

export const ideTaskWorkspaceRoutes = new Router()

ideTaskWorkspaceRoutes.get('/api/ide/task-workspace', async (ctx) => {
  const taskId = String(ctx.query.task ?? '').trim()
  if (!taskId) {
    ctx.status = 400
    ctx.body = { error: 'task query param required' }
    return
  }
  const board = String(ctx.query.board ?? '').trim() || 'default'
  try {
    const detail = await fetchTaskDetail(ctx, taskId, board)
    if (!detail?.task) {
      ctx.status = 404
      ctx.body = { error: 'task not found' }
      return
    }
    ctx.body = resolveTaskWorkspace(
      {
        taskId,
        board,
        workspaceKind: detail.task.workspace_kind ?? null,
        workspacePath: detail.task.workspace_path ?? null,
        branchName: detail.task.branch_name ?? null,
        status: detail.task.status ?? null,
      },
      {
        kanbanHome: kanbanHomeDir(),
        isDir: (p) => {
          try {
            return statSync(p).isDirectory()
          } catch {
            return false
          }
        },
      },
    )
  } catch (err) {
    ctx.status = 502
    ctx.body = { error: `task workspace resolve failed: ${err instanceof Error ? err.message : String(err)}` }
  }
})

export default ideTaskWorkspaceRoutes

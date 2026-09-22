/**
 * IDE Worktree 编排控制器（/api/ide/worktree/*）——任务级工作树隔离。
 *
 * R5 引擎域（codex-product + Qoder 任务级 worktree 语义）：
 * loop WorktreeManager 的 detached-HEAD 建/回收能力暴露给工作台会话：
 *   POST /api/ide/worktree/create  { sessionId, repoRoot }
 *     → 建 worktree（id=wt-<sessionId 前 12 位>）并把会话 workspace 绑定到该路径
 *       （复用既有 POST /api/studio/sessions/:id/workspace 同一存储字段）；
 *   POST /api/ide/worktree/remove  { sessionId } → 回收 worktree 并清空绑定；
 *   GET  /api/ide/worktree/list    → 当前 .loop/worktrees 下的存活清单。
 *
 * 挂载：B 类 patch（series 348）在 packages/server/src/bootstrap/routes.ts
 * `app.use(ideWorktreeRoutes.routes())`，与 ide/git、ide/storage 同款模式。
 *
 * 安全约束：
 *  - repoRoot 必须经 `git rev-parse --show-toplevel` 验证为仓库（非仓库 → 400）；
 *  - worktree 落点固定在 repoRoot 的 .loop/worktrees/ 下（WorktreeManager 同款），
 *    客户端不可指任意路径；sessionId 只做 worktreeId 派生，shell 零拼接
 *    （WorktreeManager 内部 execFile 固定参数数组）。
 */
import Router from '@koa/router'
import { WorktreeManager } from '../../loop/engine/worktree-manager'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync, promises as fs } from 'fs'
import { resolve } from 'path'

const execFileAsync = promisify(execFile)
const manager = new WorktreeManager()

interface CreateBody { sessionId?: string; repoRoot?: string }
interface RemoveBody { sessionId?: string; repoRoot?: string }

function worktreeIdFor(sessionId: string): string {
  const clean = sessionId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 12) || 'anon'
  return `wt-${clean}`
}

async function resolveRepoRoot(repoRoot: string): Promise<string | null> {
  if (!repoRoot || typeof repoRoot !== 'string') return null
  try {
    const { stdout } = await execFileAsync('git', ['-C', repoRoot, 'rev-parse', '--show-toplevel'])
    return stdout.trim() || null
  } catch {
    return null
  }
}

async function bindSessionWorkspace(ctx: any, sessionId: string, workspace: string | null): Promise<void> {
  // 会话绑定复用既有 REST 端点 POST /api/studio/sessions/:id/workspace（与
  // controllers/sessions.ts setWorkspace 同一存储），经本机 HTTP 自请求——
  // custom 控制器经符号链接挂载，不可相对 import upstream modules（软链真实
  // 路径解析不到 src/modules），HTTP 自请求是唯一干净通道。
  const token = typeof ctx.get === 'function' ? ctx.get('authorization') : ''
  const port = process.env.PORT || '8647'
  const res = await fetch(`http://127.0.0.1:${port}/api/studio/sessions/${encodeURIComponent(sessionId)}/workspace`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { authorization: token } : {}),
    },
    body: JSON.stringify({ workspace }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    ctx.status = 500
    ctx.body = { error: `bind workspace failed: HTTP ${res.status} ${text.slice(0, 120)}` }
    throw new Error(`bind workspace HTTP ${res.status}`)
  }
}

async function listWorktrees(repoRoot: string): Promise<Array<{ id: string; path: string }>> {
  const dir = resolve(repoRoot, '.loop/worktrees')
  if (!existsSync(dir)) return []
  const entries = await fs.readdir(dir, { withFileTypes: true })
  return entries.filter((e) => e.isDirectory()).map((e) => ({ id: e.name, path: resolve(dir, e.name) }))
}

const ideWorktreeRouter = new Router()

ideWorktreeRouter.post('/api/ide/worktree/create', async (ctx) => {
  const { sessionId, repoRoot } = ctx.request.body as CreateBody
  if (!sessionId || !repoRoot) {
    ctx.status = 400
    ctx.body = { error: 'sessionId and repoRoot are required' }
    return
  }
  const repo = await resolveRepoRoot(repoRoot)
  if (!repo) {
    ctx.status = 400
    ctx.body = { error: 'not_a_git_repo' }
    return
  }
  const id = worktreeIdFor(sessionId)
  try {
    // repoRoot 显式锚定:建/绑/回收同落 repo/.loop/worktrees(修 create 落
    // cwd 与 bind 取 repo 的路径分叉;Windows 打包态 cwd 只读时尤为致命)。
    await manager.create({ id: `task/${id.replace(/^wt-/, '')}` } as never, { repoRoot: repo })
  } catch (err) {
    ctx.status = 500
    ctx.body = { error: `worktree create failed: ${err instanceof Error ? err.message : String(err)}` }
    return
  }
  const wtPath = resolve(repo, '.loop/worktrees', id)
  try {
    await bindSessionWorkspace(ctx, sessionId, wtPath)
  } catch {
    return // bindSessionWorkspace 已置 ctx
  }
  ctx.body = { ok: true, worktreeId: id, path: wtPath }
})

ideWorktreeRouter.post('/api/ide/worktree/remove', async (ctx) => {
  const { sessionId, repoRoot } = ctx.request.body as RemoveBody
  if (!sessionId || !repoRoot) {
    ctx.status = 400
    ctx.body = { error: 'sessionId and repoRoot are required' }
    return
  }
  const repo = await resolveRepoRoot(repoRoot)
  if (!repo) {
    ctx.status = 400
    ctx.body = { error: 'not_a_git_repo' }
    return
  }
  const id = worktreeIdFor(sessionId)
  try {
    await manager.remove(id, { repoRoot: repo })
  } catch (err) {
    ctx.status = 500
    ctx.body = { error: `worktree remove failed: ${err instanceof Error ? err.message : String(err)}` }
    return
  }
  try {
    await bindSessionWorkspace(ctx, sessionId, null)
  } catch {
    return
  }
  ctx.body = { ok: true, worktreeId: id }
})

ideWorktreeRouter.get('/api/ide/worktree/list', async (ctx) => {
  const repoRoot = typeof ctx.query.repoRoot === 'string' ? ctx.query.repoRoot : ''
  const repo = repoRoot ? await resolveRepoRoot(repoRoot) : null
  if (!repo) {
    ctx.body = { worktrees: [] }
    return
  }
  ctx.body = { worktrees: await listWorktrees(repo) }
})

export default ideWorktreeRouter

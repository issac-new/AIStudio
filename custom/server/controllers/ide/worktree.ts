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
import { createHash } from 'crypto'
import { promisify } from 'util'
import { existsSync, promises as fs } from 'fs'
import { resolve } from 'path'

const execFileAsync = promisify(execFile)
const manager = new WorktreeManager()

interface CreateBody { sessionId?: string; repoRoot?: string }
interface RemoveBody { sessionId?: string; repoRoot?: string }

/**
 * worktree id 派生：sessionId 全量 sha1 取前 12 hex 位。
 * 此前取「洗净后的前 12 字符」——会话 id 是 `${Date.now().toString(36)}+随机6位`，
 * 前 12 位里只有约 4 位随机（~20bit），同窗创建的两个会话可能撞 id，后者的
 * create 会 rm 掉前者正在使用的 worktree（未提交工作丢失）；全非 ASCII id
 * 则统一洗净成 'anon'，退化成必然碰撞。哈希派生两者皆除。
 */
function worktreeIdFor(sessionId: string): string {
  const hash = createHash('sha1').update(sessionId).digest('hex').slice(0, 12)
  return `wt-${hash}`
}

/** 同 id 并发闸：双击「建隔离」时两个 create 并发通过 existsSync 检查后交错
 * rm/add（半成品目录 / already exists 报错）。进程内按 id 串行。 */
const createLocks = new Map<string, Promise<unknown>>()
async function withCreateLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const prev = createLocks.get(id) ?? Promise.resolve()
  const run = prev.then(fn, fn)
  createLocks.set(id, run.catch(() => { /* 链条继续 */ }))
  try {
    return await run
  } finally {
    if (createLocks.get(id) === run) createLocks.delete(id)
  }
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

/** 过期清扫（默认 >24h 未动）：cleanupStale 此前无任何调用方，IDE worktree
 *  只靠 20 上限按 mtime 挤出，长期运行的仓库会积压半永久目录。挂在 list 与
 *  create 上惰性触发（徽标/面板轮询 list 即清扫），失败不阻塞主流程。 */
async function sweepStaleWorktrees(repoRoot: string): Promise<void> {
  try {
    await manager.cleanupStale(24 * 60 * 60 * 1000, { repoRoot })
  } catch { /* 清扫失败不影响列表/创建 */ }
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
  await sweepStaleWorktrees(repo)
  const id = worktreeIdFor(sessionId)
  try {
    // repoRoot 显式锚定:建/绑/回收同落 repo/.loop/worktrees(修 create 落
    // cwd 与 bind 取 repo 的路径分叉;Windows 打包态 cwd 只读时尤为致命)。
    // bind 失败时回滚刚建的 worktree——否则孤儿目录占 MAX_WORKTREES=20 名额。
    await withCreateLock(id, async () => {
      await manager.create({ id: `task/${id.replace(/^wt-/, '')}` } as never, { repoRoot: repo })
      const wtPath = resolve(repo, '.loop/worktrees', id)
      try {
        await bindSessionWorkspace(ctx, sessionId, wtPath)
      } catch {
        await manager.remove(id, { repoRoot: repo }).catch(() => { /* 回滚尽力而为 */ })
        throw new Error('bind workspace failed')
      }
    })
  } catch (err) {
    if (!ctx.body) {
      ctx.status = 500
      ctx.body = { error: `worktree create failed: ${err instanceof Error ? err.message : String(err)}` }
    }
    return
  }
  ctx.body = { ok: true, worktreeId: id, path: resolve(repo, '.loop/worktrees', id) }
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
  await sweepStaleWorktrees(repo)
  ctx.body = { worktrees: await listWorktrees(repo) }
})

export default ideWorktreeRouter

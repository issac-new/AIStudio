/**
 * IDE Git API controller（/api/ide/git/*）。
 *
 * 对标 ZCode 3.11.2 Git 面板的 MVP 子集（status/diff/stage/commit），
 * 供 /ide 工作台 Git 页签消费。设计见
 * docs/superpowers/specs/2026-09-17-zcode-3112-parity-analysis.md §二 G2。
 *
 * 挂载：B 类 patch（series 285）在 packages/server/src/bootstrap/routes.ts
 * `app.use(ideGitRoutes.routes())`，与 trace/terminal-tools 同款模式，继承
 * 全局 authMiddleware 链（同 patch 134 的鉴权位次说明）。
 *
 * 安全约束：
 *  - git 经 spawn 固定参数数组执行，零 shell 拼接；
 *  - cwd = 客户端传入 root，先经 `git rev-parse --show-toplevel` 验证为仓库
 *    （非仓库 → 404 not_a_repo），后续命令统一 `-C repoRoot`；
 *  - file 参数拒绝绝对路径与 `..` 段（跨仓逃逸防护）；
 *  - 全部命令 10s 超时；commit message 非空且 ≤5000 字符；stage 文件数 ≤200。
 *  - 本控制器不新增权限面：终端面板已提供全 shell 能力，此处仅为 UI 便利层。
 */
import Router from '@koa/router'
import { spawn } from 'child_process'
import { isAbsolute, normalize, sep } from 'path'

const GIT_TIMEOUT_MS = 10_000
/** 变更类命令（stage/commit/checkout/push）上限：10s 即 SIGKILL 会打断 checkout/commit
 *  留下 index.lock 砖死面板，慢网络推送也必然超时，故单独放宽。 */
const GIT_MUTATING_TIMEOUT_MS = 120_000
const MAX_STAGE_FILES = 200
const MAX_MESSAGE_CHARS = 5_000

/** 按子命令分级超时：读类 10s，变更类 120s（纯函数，守门测试消费） */
export function gitTimeoutMs(args: string[]): number {
  // 带值的全局旗标（如 -C <repoRoot>）连同其值一起跳过，取到的首个位置参数才是子命令
  const valueFlags = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path'])
  const mutating = new Set(['add', 'restore', 'commit', 'checkout', 'push', 'pull', 'merge', 'rebase', 'clone', 'fetch'])
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--') break
    if (arg.startsWith('-')) {
      if (valueFlags.has(arg)) i++
      continue
    }
    return mutating.has(arg) ? GIT_MUTATING_TIMEOUT_MS : GIT_TIMEOUT_MS
  }
  return GIT_TIMEOUT_MS
}

export interface GitChange {
  /** 仓库相对路径（rename 为新路径） */
  file: string
  /** rename 原路径（非 rename 为 null） */
  renamedFrom: string | null
  /** index 侧状态码（porcelain X 列，'?'/' '=无变更 等） */
  indexStatus: string
  /** worktree 侧状态码（porcelain Y 列） */
  worktreeStatus: string
  /** 展示分类：added/modified/deleted/renamed/conflicted/untracked */
  kind: 'added' | 'modified' | 'deleted' | 'renamed' | 'conflicted' | 'untracked'
}

export interface GitStatus {
  /** 仓库根（rev-parse --show-toplevel 的规范化绝对路径） */
  repoRoot: string
  branch: string
  upstream: string | null
  ahead: number
  behind: number
  /** detached HEAD 时为 true（branch 显示为 HEAD） */
  detached: boolean
  changes: GitChange[]
}

interface GitResult {
  code: number
  stdout: string
  stderr: string
}

function runGit(args: string[], cwd: string): Promise<GitResult> {
  return new Promise((resolve) => {
    const child = spawn('git', args, { cwd, windowsHide: true })
    let stdout = ''
    let stderr = ''
    let settled = false
    const finish = (result: GitResult) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      finish({ code: -1, stdout, stderr: 'git command timed out' })
    }, gitTimeoutMs(args))
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8') })
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8') })
    child.on('error', (err) => finish({ code: -1, stdout, stderr: String(err) }))
    child.on('close', (code) => finish({ code: code ?? -1, stdout, stderr }))
  })
}

/** file 参数守卫：仓库相对路径，拒绝绝对路径与 `..` 段 */
export function isSafeRelativeFile(file: string): boolean {
  if (!file || file.length > 1024) return false
  if (isAbsolute(file) || /^[a-zA-Z]:[\\/]/.test(file)) return false
  const normalized = normalize(file)
  if (normalized.split(sep).includes('..')) return false
  if (normalized === '.') return false
  return true
}

/** checkout 分支名守卫：git 规范 ref 名不会以 - 或 . 开头，放行会把 git 选项
 *  （--detach/--orphan 等）误当分支名注入。单一事实源，控制器与测试共用。 */
export function isSafeBranchName(branch: string): boolean {
  return /^\w[\w./-]{0,99}$/.test(branch)
}

/** git C 风格短转义映射（core.quotepath 默认开启时的引号路径内） */
const GIT_SHORT_ESCAPES: Record<string, string> = {
  a: '\x07', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v', '"': '"', '\\': '\\',
}

/** git C 风格转义还原：非 ASCII 字节以八进制 \NNN 出现（非法 JSON，不能走
 *  JSON.parse——\3 首字符即抛 Bad escaped character），按字节收集后统一 UTF-8
 *  解码；未知转义保留原字符。 */
function unescapeGitPath(body: string): string {
  if (!body.includes('\\')) return body
  const bytes: number[] = []
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if (ch !== '\\') {
      bytes.push(ch.charCodeAt(0))
      continue
    }
    const next = body[i + 1]
    if (next === undefined) {
      bytes.push(ch.charCodeAt(0))
      break
    }
    if (next >= '0' && next <= '7') {
      let oct = next
      let j = i + 2
      while (oct.length < 3 && j < body.length && body[j] >= '0' && body[j] <= '7') {
        oct += body[j]
        j++
      }
      bytes.push(parseInt(oct, 8) & 0xff)
      i = j - 1
      continue
    }
    const mapped = GIT_SHORT_ESCAPES[next]
    if (mapped !== undefined) {
      bytes.push(mapped.charCodeAt(0))
      i++
    } else {
      bytes.push(ch.charCodeAt(0))
    }
  }
  return Buffer.from(bytes).toString('utf8')
}

/** porcelain v1 的带引号路径还原（git 对含非 ASCII/特殊字符路径 C 风格加引号） */
function unquotePath(raw: string): string {
  if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) {
    return unescapeGitPath(raw.slice(1, -1))
  }
  return raw
}

/** 纯函数：`git status --porcelain=v1 -b` 输出 → GitStatus（守门测试消费） */
export function parseGitStatus(repoRoot: string, output: string): GitStatus {
  const lines = output.split('\n')
  const status: GitStatus = {
    repoRoot,
    branch: '',
    upstream: null,
    ahead: 0,
    behind: 0,
    detached: false,
    changes: [],
  }
  for (const line of lines) {
    if (!line) continue
    if (line.startsWith('## ')) {
      const header = line.slice(3)
      const aheadMatch = /ahead (\d+)/.exec(header)
      const behindMatch = /behind (\d+)/.exec(header)
      status.ahead = aheadMatch ? Number(aheadMatch[1]) : 0
      status.behind = behindMatch ? Number(behindMatch[1]) : 0
      const head = header.split('...')[0].trim()
      if (head === 'HEAD (no branch)') {
        status.detached = true
        status.branch = 'HEAD'
      } else {
        status.branch = head
        const upstreamPart = /\.+\.(.+?)(?: \[|$)/.exec(header)
        status.upstream = upstreamPart ? upstreamPart[1].trim() : null
      }
      continue
    }
    if (line.length < 4) continue
    const indexStatus = line[0]
    const worktreeStatus = line[1]
    const pathPart = line.slice(3)
    let file = pathPart
    let renamedFrom: string | null = null
    const renameArrow = pathPart.indexOf(' -> ')
    if (renameArrow >= 0) {
      renamedFrom = unquotePath(pathPart.slice(0, renameArrow))
      file = unquotePath(pathPart.slice(renameArrow + 4))
    } else {
      file = unquotePath(pathPart)
    }
    status.changes.push({
      file,
      renamedFrom,
      indexStatus,
      worktreeStatus,
      kind: toKind(indexStatus, worktreeStatus),
    })
  }
  return status
}

function toKind(indexStatus: string, worktreeStatus: string): GitChange['kind'] {
  if (indexStatus === '?' && worktreeStatus === '?') return 'untracked'
  // 冲突族：DD/AU/UD/UA/DU/AA/UU
  if (
    (indexStatus === 'D' && worktreeStatus === 'D')
    || indexStatus === 'A' && worktreeStatus === 'U'
    || indexStatus === 'U' && worktreeStatus === 'D'
    || indexStatus === 'U' && worktreeStatus === 'A'
    || indexStatus === 'D' && worktreeStatus === 'U'
    || (indexStatus === 'A' && worktreeStatus === 'A')
    || (indexStatus === 'U' && worktreeStatus === 'U')
  ) return 'conflicted'
  if (indexStatus === 'R' || worktreeStatus === 'R') return 'renamed'
  if (indexStatus === 'A' || worktreeStatus === 'A') return 'added'
  if (indexStatus === 'D' || worktreeStatus === 'D') return 'deleted'
  return 'modified'
}

/** 解析 root 并验证为 git 仓库；失败返回 null（调用方映射 400/404） */
async function resolveRepo(root: string): Promise<string | null> {
  const result = await runGit(['rev-parse', '--show-toplevel'], root)
  if (result.code !== 0) return null
  const repoRoot = result.stdout.trim()
  return repoRoot || null
}

function errorBody(code: string, message: string): { error: string; message: string } {
  return { error: code, message }
}

const ideGitRouter = new Router({ prefix: '/api/ide/git' })

// GET /api/ide/git/status?root=<abs path>
ideGitRouter.get('/status', async (ctx) => {
  const root = String(ctx.query.root ?? '')
  if (!root || !isAbsolute(root)) {
    ctx.status = 400
    ctx.body = errorBody('invalid_root', 'root must be an absolute path')
    return
  }
  const repoRoot = await resolveRepo(root)
  if (!repoRoot) {
    ctx.status = 404
    ctx.body = errorBody('not_a_repo', 'workspace is not inside a git repository')
    return
  }
  // -uall：未跟踪目录展开到文件（默认 -unormal 折叠为目录项，面板需要文件粒度）
  const result = await runGit(['-C', repoRoot, 'status', '--porcelain=v1', '-b', '-uall'], repoRoot)
  if (result.code !== 0) {
    ctx.status = 500
    ctx.body = errorBody('git_failed', result.stderr.trim() || 'git status failed')
    return
  }
  ctx.body = parseGitStatus(repoRoot, result.stdout)
})

// GET /api/ide/git/diff?root=<abs>&file=<rel>&staged=<0|1>
ideGitRouter.get('/diff', async (ctx) => {
  const root = String(ctx.query.root ?? '')
  const file = String(ctx.query.file ?? '')
  const staged = String(ctx.query.staged ?? '0') === '1'
  if (!root || !isAbsolute(root)) {
    ctx.status = 400
    ctx.body = errorBody('invalid_root', 'root must be an absolute path')
    return
  }
  if (!isSafeRelativeFile(file)) {
    ctx.status = 400
    ctx.body = errorBody('invalid_file', 'file must be a safe relative path')
    return
  }
  const repoRoot = await resolveRepo(root)
  if (!repoRoot) {
    ctx.status = 404
    ctx.body = errorBody('not_a_repo', 'workspace is not inside a git repository')
    return
  }
  const args = staged
    ? ['-C', repoRoot, 'diff', '--cached', '--', file]
    : ['-C', repoRoot, 'diff', '--', file]
  const result = await runGit(args, repoRoot)
  if (result.code !== 0) {
    ctx.status = 500
    ctx.body = errorBody('git_failed', result.stderr.trim() || 'git diff failed')
    return
  }
  ctx.body = { file, staged, diff: result.stdout }
})

// POST /api/ide/git/stage  { root, files: string[], staged: boolean }
ideGitRouter.post('/stage', async (ctx) => {
  const body = (ctx.request.body ?? {}) as { root?: unknown; files?: unknown; staged?: unknown }
  const root = typeof body.root === 'string' ? body.root : ''
  const files = Array.isArray(body.files) ? body.files.filter((f): f is string => typeof f === 'string') : []
  const staged = body.staged !== false
  if (!root || !isAbsolute(root)) {
    ctx.status = 400
    ctx.body = errorBody('invalid_root', 'root must be an absolute path')
    return
  }
  if (files.length === 0 || files.length > MAX_STAGE_FILES || !files.every(isSafeRelativeFile)) {
    ctx.status = 400
    ctx.body = errorBody('invalid_files', 'files must be 1-200 safe relative paths')
    return
  }
  const repoRoot = await resolveRepo(root)
  if (!repoRoot) {
    ctx.status = 404
    ctx.body = errorBody('not_a_repo', 'workspace is not inside a git repository')
    return
  }
  const args = staged
    ? ['-C', repoRoot, 'add', '--', ...files]
    : ['-C', repoRoot, 'restore', '--staged', '--', ...files]
  const result = await runGit(args, repoRoot)
  if (result.code !== 0) {
    ctx.status = 500
    ctx.body = errorBody('git_failed', result.stderr.trim() || 'git stage failed')
    return
  }
  ctx.body = { ok: true, staged, files }
})

// POST /api/ide/git/commit  { root, message }
ideGitRouter.post('/commit', async (ctx) => {
  const body = (ctx.request.body ?? {}) as { root?: unknown; message?: unknown }
  const root = typeof body.root === 'string' ? body.root : ''
  const message = typeof body.message === 'string' ? body.message.trim() : ''
  if (!root || !isAbsolute(root)) {
    ctx.status = 400
    ctx.body = errorBody('invalid_root', 'root must be an absolute path')
    return
  }
  if (!message || message.length > MAX_MESSAGE_CHARS) {
    ctx.status = 400
    ctx.body = errorBody('invalid_message', 'message must be 1-5000 chars')
    return
  }
  const repoRoot = await resolveRepo(root)
  if (!repoRoot) {
    ctx.status = 404
    ctx.body = errorBody('not_a_repo', 'workspace is not inside a git repository')
    return
  }
  const result = await runGit(['-C', repoRoot, 'commit', '-m', message], repoRoot)
  if (result.code !== 0) {
    ctx.status = 500
    ctx.body = errorBody('commit_failed', result.stderr.trim() || 'git commit failed')
    return
  }
  ctx.body = { ok: true, output: result.stdout.trim() }
})


// GET /api/ide/git/branches?root=  —— 本地分支列表（含当前指针）
ideGitRouter.get('/branches', async (ctx) => {
  const root = typeof ctx.query.root === 'string' ? ctx.query.root : ''
  if (!root || !isAbsolute(root)) {
    ctx.status = 400
    ctx.body = errorBody('invalid_root', 'root must be an absolute path')
    return
  }
  const repoRoot = await resolveRepo(root)
  if (!repoRoot) {
    ctx.status = 404
    ctx.body = errorBody('not_a_repo', 'workspace is not inside a git repository')
    return
  }
  const result = await runGit(['-C', repoRoot, 'branch', '--format=%(refname:short)%00%(HEAD)'], repoRoot)
  if (result.code !== 0) {
    ctx.status = 500
    ctx.body = errorBody('git_failed', result.stderr.trim() || 'git branch failed')
    return
  }
  const branches = result.stdout.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const [name, head] = l.split('\u0000')
    return { name, current: head === '*' }
  })
  ctx.body = { branches }
})

// POST /api/ide/git/checkout  { root, branch }  —— 分支切换（拒绝脏工作区由 git 自身报错）
ideGitRouter.post('/checkout', async (ctx) => {
  const body = (ctx.request.body ?? {}) as { root?: unknown; branch?: unknown }
  const root = typeof body.root === 'string' ? body.root : ''
  const branch = typeof body.branch === 'string' ? body.branch.trim() : ''
  if (!root || !isAbsolute(root)) {
    ctx.status = 400
    ctx.body = errorBody('invalid_root', 'root must be an absolute path')
    return
  }
  if (!isSafeBranchName(branch)) {
    ctx.status = 400
    ctx.body = errorBody('invalid_branch', 'branch must be 1-100 chars of [\w./-] and not start with -')
    return
  }
  const repoRoot = await resolveRepo(root)
  if (!repoRoot) {
    ctx.status = 404
    ctx.body = errorBody('not_a_repo', 'workspace is not inside a git repository')
    return
  }
  const result = await runGit(['-C', repoRoot, 'checkout', branch], repoRoot)
  if (result.code !== 0) {
    ctx.status = 409
    ctx.body = errorBody('checkout_failed', result.stderr.trim() || 'git checkout failed')
    return
  }
  ctx.body = { ok: true, branch, output: result.stdout.trim() }
})

// POST /api/ide/git/push  { root }  —— 推送当前分支（凭据走 git 自身配置）
ideGitRouter.post('/push', async (ctx) => {
  const body = (ctx.request.body ?? {}) as { root?: unknown }
  const root = typeof body.root === 'string' ? body.root : ''
  if (!root || !isAbsolute(root)) {
    ctx.status = 400
    ctx.body = errorBody('invalid_root', 'root must be an absolute path')
    return
  }
  const repoRoot = await resolveRepo(root)
  if (!repoRoot) {
    ctx.status = 404
    ctx.body = errorBody('not_a_repo', 'workspace is not inside a git repository')
    return
  }
  const result = await runGit(['-C', repoRoot, 'push'], repoRoot)
  if (result.code !== 0) {
    ctx.status = 502
    ctx.body = errorBody('push_failed', result.stderr.trim() || result.stdout.trim() || 'git push failed')
    return
  }
  ctx.body = { ok: true, output: (result.stdout + result.stderr).trim() }
})

// GET /api/ide/git/log?root=&limit=  —— 提交图谱数据（gitGraph 对应物：分叉简化为引用徽标列表）
ideGitRouter.get('/log', async (ctx) => {
  const root = typeof ctx.query.root === 'string' ? ctx.query.root : ''
  const limitRaw = typeof ctx.query.limit === 'string' ? parseInt(ctx.query.limit, 10) : 100
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 100
  if (!root || !isAbsolute(root)) {
    ctx.status = 400
    ctx.body = errorBody('invalid_root', 'root must be an absolute path')
    return
  }
  const repoRoot = await resolveRepo(root)
  if (!repoRoot) {
    ctx.status = 404
    ctx.body = errorBody('not_a_repo', 'workspace is not inside a git repository')
    return
  }
  const sep = '\u001f'
  const result = await runGit([
    '-C', repoRoot, 'log', `-n`, String(limit),
    `--pretty=format:%H${sep}%h${sep}%an${sep}%at${sep}%D${sep}%s`,
  ], repoRoot)
  if (result.code !== 0) {
    ctx.status = 500
    ctx.body = errorBody('git_failed', result.stderr.trim() || 'git log failed')
    return
  }
  const commits = result.stdout.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
    const [hash, short, author, timestamp, refs, subject] = line.split(sep)
    return {
      hash,
      short,
      author,
      timestamp: Number(timestamp) * 1000,
      refs: (refs || '').split(',').map(r => r.trim()).filter(r => r && r !== 'HEAD'),
      isHead: (refs || '').includes('HEAD'),
      subject: subject || '',
    }
  })
  ctx.body = { commits }
})

export default ideGitRouter

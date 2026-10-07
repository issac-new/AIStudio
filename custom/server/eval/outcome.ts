// overlay[eval] Eval Studio · 环境终态校验器（spec §4.4，文章启示⑤）。
//
// 文本声明"已预订"不算通过，数据库存在记录才算——Outcome 以系统实际状态为准。
// 移植 simharness verify_done_evidence/repo_has/branch_fresh 的"可反向核验"概念：
//   file_exists / content_contains —— 文件系统终态（safe 路径守卫由调用方注入）；
//   repo_commit_on —— git 仓 origin/main 存在性 + 新鲜度窗口（防旧稿假真值）；
//   kanban_card_status —— SwarmKanban 卡状态（studio API，注入 fetch）。
// 注册表开放扩展；run12 图执行推演闸门后续可迁此。
import { execFile } from 'child_process'
import { readFile } from 'fs/promises'
import type { OutcomeCheckDecl } from './types'

export interface OutcomeResult {
  ok: boolean
  detail?: string
}

export interface OutcomeRunContext {
  /** 运行起跑时刻（新鲜度窗口锚点，repo_commit_on 用）。 */
  runStartedAt: number
  fetchImpl?: typeof fetch
  /** git 执行注入（默认 child_process.execFile，测试可替换）。 */
  gitExec?: (args: string[], cwd: string) => Promise<{ stdout: string }>
  /** 文件读取注入（测试可替换）。 */
  readFileImpl?: typeof readFile
  /** 路径守卫：允许访问的根目录列表（fail-closed：无守卫时拒绝执行文件类校验）。 */
  allowedRoots?: string[]
  /** kanban API 基址与凭据（controller 层注入）。 */
  kanban?: { baseUrl: string; token?: string; board?: string }
}

export type OutcomeVerifier = (params: Record<string, string>, ctx: OutcomeRunContext) => Promise<OutcomeResult>

function fail(detail: string): OutcomeResult {
  return { ok: false, detail }
}

function isWithin(child: string, roots: string[] | undefined): boolean {
  if (!roots || roots.length === 0) return false
  return roots.some((root) => child === root || child.startsWith(`${root}/`) || child.startsWith(`${root}\\`))
}

function defaultGitExec(args: string[], cwd: string): Promise<{ stdout: string }> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, timeout: 15_000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => {
      if (error) reject(error)
      else resolve({ stdout: String(stdout) })
    })
  })
}

const verifiers: Record<string, OutcomeVerifier> = {
  /** params: { path } —— 文件存在即终态达成。 */
  async file_exists(params, ctx) {
    const path = params.path
    if (!path) return fail('path 必填')
    if (!isWithin(path, ctx.allowedRoots)) return fail(`path 不在允许根目录内（fail-closed）：${path}`)
    try {
      await (ctx.readFileImpl ?? readFile)(path, 'utf8')
      return { ok: true, detail: `文件存在：${path}` }
    } catch (e) {
      return fail(`文件不存在或不可读：${path}（${(e as Error).message}）`)
    }
  },

  /** params: { path, contains } —— 文件内容包含关键串（如测试报告中的 PASS 行）。 */
  async content_contains(params, ctx) {
    const { path, contains } = params
    if (!path || !contains) return fail('path 与 contains 必填')
    if (!isWithin(path, ctx.allowedRoots)) return fail(`path 不在允许根目录内（fail-closed）：${path}`)
    try {
      const content = await (ctx.readFileImpl ?? readFile)(path, 'utf8')
      return content.includes(contains)
        ? { ok: true, detail: `命中（${contains.slice(0, 80)}）` }
        : fail(`内容未包含目标串：${contains.slice(0, 80)}`)
    } catch (e) {
      return fail(`读取失败：${path}（${(e as Error).message}）`)
    }
  },

  /**
   * params: { repo, branch?, expectCommit? } —— 移植 simharness repo_has：
   * expectCommit 真在 origin/<branch> 上才算达成；expectCommit 缺省时校验
   * branch tip 提交时间 ≥ runStartedAt（branch_fresh 语义：防起跑前的旧稿冒新）。
   */
  async repo_commit_on(params, ctx) {
    const { repo, branch = 'main', expectCommit } = params
    if (!repo) return fail('repo 必填')
    const gitExec = ctx.gitExec ?? defaultGitExec
    try {
      if (expectCommit) {
        // git branch -r --contains <sha>：列出包含该提交的远端分支
        const { stdout } = await gitExec(['branch', '-r', '--contains', expectCommit], repo)
        const onBranch = stdout
          .split('\n')
          .map((l) => l.trim())
          .some((l) => l === `origin/${branch}` || l.startsWith(`origin/${branch}`))
        return onBranch
          ? { ok: true, detail: `提交 ${expectCommit.slice(0, 10)} 在 origin/${branch} 上` }
          : fail(`提交 ${expectCommit.slice(0, 10)} 不在 origin/${branch} 上`)
      }
      // 新鲜度窗口：tip 提交时间须 ≥ 起跑时刻
      const { stdout } = await gitExec(['log', '-1', '--format=%ct', `origin/${branch}`], repo)
      const tipAt = Number(stdout.trim()) * 1000
      if (!Number.isFinite(tipAt)) return fail(`无法解析 origin/${branch} tip 时间：${stdout.trim()}`)
      if (tipAt + 1 < ctx.runStartedAt) {
        return fail(`origin/${branch} tip（${new Date(tipAt).toISOString()}）早于起跑时刻（新鲜度窗口不满足）`)
      }
      return { ok: true, detail: `origin/${branch} tip 新鲜（${new Date(tipAt).toISOString()}）` }
    } catch (e) {
      return fail(`git 校验失败：${(e as Error).message}`)
    }
  },

  /** params: { board, cardId, expectStatus } —— SwarmKanban 卡终态。 */
  async kanban_card_status(params, ctx) {
    const { board, cardId, expectStatus } = params
    if (!board || !cardId || !expectStatus) return fail('board/cardId/expectStatus 必填')
    const kanban = ctx.kanban
    if (!kanban?.baseUrl) return fail('kanban 上下文未配置（baseUrl 缺失）')
    const doFetch = ctx.fetchImpl ?? fetch
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (kanban.token) headers.Authorization = `Bearer ${kanban.token}`
      const response = await doFetch(`${kanban.baseUrl}/api/hermes/kanban?board=${encodeURIComponent(board)}`, { headers })
      if (!response.ok) return fail(`kanban API HTTP ${response.status}`)
      const body = (await response.json()) as { cards?: Array<{ id?: string; status?: string; column?: string }> }
      const card = body.cards?.find((c) => c.id === cardId)
      if (!card) return fail(`卡不存在：${cardId}`)
      const actual = card.status ?? card.column ?? ''
      return actual === expectStatus
        ? { ok: true, detail: `卡 ${cardId} 状态=${actual}` }
        : fail(`卡 ${cardId} 状态=${actual}，期望 ${expectStatus}`)
    } catch (e) {
      return fail(`kanban 查询失败：${(e as Error).message}`)
    }
  },
}

export function registerOutcomeVerifier(name: string, verifier: OutcomeVerifier): void {
  verifiers[name] = verifier
}

export function listOutcomeVerifiers(): string[] {
  return Object.keys(verifiers)
}

export async function runOutcomeCheck(
  decl: OutcomeCheckDecl,
  ctx: OutcomeRunContext,
): Promise<OutcomeResult> {
  const verifier = verifiers[decl.verifier]
  if (!verifier) return fail(`未注册的校验器：${decl.verifier}（已注册：${listOutcomeVerifiers().join('/')}）`)
  try {
    return await verifier(decl.params, ctx)
  } catch (e) {
    return fail(`校验器异常：${(e as Error).message}`)
  }
}

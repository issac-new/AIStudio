// overlay/custom/client/ide/utils/selfCheck.ts
// IDE 全能力自检：把会话、工作区、文件、Git、存储、命令、工作流、深链等
// 主链路的只读探针串成一张报告。纯函数 + 注入依赖，UI 只负责渲染。
import { resolveBootSession } from './sessionBoot'

/** IdeSidePane TABS 静态表项数（files/review/terminal/wiki/memory/ctxarchive/
 *  tools/trajectory/workflow/kanban/assistant/board/browser/storage/mcp/hooks/slash） */
export const IDE_SIDE_PANE_TAB_COUNT = 17

export type SelfCheckStatus = 'pass' | 'warn' | 'fail'

export interface SelfCheckResult {
  id: string
  label: string
  status: SelfCheckStatus
  detail: string
  ms: number
}

export interface SelfCheckContext {
  authFetch: (path: string, init?: RequestInit) => Promise<Response>
  workspace: string | null
  sessionsLoaded: boolean
  sessionCount: number
  activeSessionId: string | null
  /** 已注册的侧栏页签数（IdeSidePane TABS 静态表 17 项） */
  sidePaneTabs: number
  /** 页面可见文本里残留的裸 i18n 键数量 */
  rawI18nKeys: number
  timeoutMs?: number
}

interface CheckOutcome {
  status: SelfCheckStatus
  detail: string
}

interface CheckDef {
  id: string
  label: string
  run: () => Promise<CheckOutcome>
}

async function withTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      fn(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function qs(params: Record<string, string>): string {
  return new URLSearchParams(params).toString()
}

export async function runSelfChecks(ctx: SelfCheckContext): Promise<SelfCheckResult[]> {
  const timeoutMs = ctx.timeoutMs ?? 6000
  const api = async (
    path: string,
    validate: (body: Record<string, unknown>) => CheckOutcome,
  ): Promise<CheckOutcome> => {
    try {
      const res = await ctx.authFetch(path)
      const body = await res.json().catch(() => ({})) as Record<string, unknown>
      if (!res.ok) {
        const detail = `HTTP ${res.status}${body?.detail ? `: ${String(body.detail).slice(0, 120)}` : ''}`
        // 503=依赖未启动；401=鉴权/引擎 token；均属环境告警而非产品硬缺陷
        return { status: res.status === 503 || res.status === 401 ? 'warn' : 'fail', detail }
      }
      return validate(body)
    } catch (err) {
      return { status: 'fail', detail: err instanceof Error ? err.message : String(err) }
    }
  }

  const checks: CheckDef[] = [
    {
      id: 'session-store',
      label: '会话库装载',
      run: async () => {
        if (!ctx.sessionsLoaded) return { status: 'fail', detail: 'sessionsLoaded=false（列表未装载）' }
        if (ctx.sessionCount === 0) return { status: 'warn', detail: '会话库为空；可从历史导入或新建任务' }
        return { status: 'pass', detail: `${ctx.sessionCount} 个会话` }
      },
    },
    {
      id: 'active-session',
      label: '活动会话',
      run: async () => ctx.activeSessionId
        ? { status: 'pass', detail: ctx.activeSessionId }
        : { status: 'warn', detail: '无活动会话（裸落地草稿态）' },
    },
    {
      id: 'workspace',
      label: '工作区绑定',
      run: async () => ctx.workspace
        ? { status: 'pass', detail: ctx.workspace }
        : { status: 'warn', detail: '未绑定工作区；文件/Git/终端能力受限' },
    },
    {
      id: 'deep-link',
      label: '会话深链解析',
      run: async () => {
        if (!ctx.activeSessionId) return { status: 'warn', detail: '无活动会话可验证' }
        const hit = resolveBootSession(ctx.activeSessionId, [ctx.activeSessionId], null)
        return hit.matched
          ? { status: 'pass', detail: '?session= 可解析到当前会话' }
          : { status: 'fail', detail: '深链解析未命中' }
      },
    },
    {
      id: 'side-pane',
      label: '辅助页签注册',
      run: async () => ctx.sidePaneTabs >= 17
        ? { status: 'pass', detail: `${ctx.sidePaneTabs} 个页签` }
        : { status: 'warn', detail: `仅 ${ctx.sidePaneTabs} 个页签（预期 17）` },
    },
    {
      id: 'i18n',
      label: '文案完整性',
      run: async () => ctx.rawI18nKeys === 0
        ? { status: 'pass', detail: '无裸 i18n 键' }
        : { status: 'warn', detail: `${ctx.rawI18nKeys} 个裸键（如 ide.xxx）` },
    },
    {
      id: 'files',
      label: '文件列表 API',
      run: async () => {
        if (!ctx.workspace) return { status: 'warn', detail: '跳过：无工作区' }
        return api(`/api/studio/files/list?${qs({ root: ctx.workspace })}`, (body) =>
          Array.isArray(body.entries)
            ? { status: 'pass', detail: `${body.entries.length} 个根条目` }
            : { status: 'fail', detail: '响应缺 entries' })
      },
    },
    {
      id: 'git',
      label: 'Git 状态 API',
      run: async () => {
        if (!ctx.workspace) return { status: 'warn', detail: '跳过：无工作区' }
        return api(`/api/ide/git/status?${qs({ root: ctx.workspace })}`, (body) =>
          body.repoRoot
            ? { status: 'pass', detail: `${String(body.branch ?? '?')} · ${(body.changes as unknown[] | undefined)?.length ?? 0} 变更` }
            : { status: 'warn', detail: '非 Git 仓库（面板显示 not_a_repo 是诚实态）' })
      },
    },
    {
      id: 'storage',
      label: '资源管理器 API',
      run: async () => api('/api/ide/storage/snapshot', (body) =>
        body.partial
          ? { status: 'warn', detail: '扫描超预算，部分分类为下限值' }
          : { status: 'pass', detail: `${(body.categories as unknown[] | undefined)?.length ?? 0} 个分类` }),
    },
    {
      id: 'slash',
      label: '斜杠命令 API',
      run: async () => api('/api/ide/slash-commands', (body) =>
        Array.isArray(body.commands)
          ? { status: 'pass', detail: `${body.commands.length} 条` }
          : { status: 'fail', detail: '响应缺 commands' }),
    },
    {
      id: 'automations',
      label: '自动化 API',
      run: async () => api('/api/ide/automations', (body) =>
        Array.isArray(body.rules)
          ? { status: 'pass', detail: `${body.rules.length} 条规则` }
          : { status: 'fail', detail: '响应缺 rules' }),
    },
    {
      id: 'engine-models',
      label: '模型目录 API',
      run: async () => api('/api/ide/engine-models', (body) => {
        const providers = (body.config as { providers?: unknown[] } | undefined)?.providers
        return Array.isArray(providers) && providers.length
          ? { status: 'pass', detail: `${providers.length} 个 provider` }
          : { status: 'warn', detail: '模型目录为空' }
      }),
    },
    {
      id: 'workflow',
      label: '工作流 API（引擎）',
      run: async () => {
        if (!ctx.workspace) return { status: 'warn', detail: '跳过：无工作区' }
        return api(`/api/zcode-engine/workflow/saved?${qs({ workspacePath: ctx.workspace, scope: 'project' })}`, (body) =>
          Array.isArray(body.workflows)
            ? { status: 'pass', detail: `${body.workflows.length} 个已保存工作流` }
            : { status: 'warn', detail: '响应缺 workflows' })
      },
    },
    {
      id: 'context-archive',
      label: '上下文档案 API',
      run: async () => api('/api/context-archive/sessions', (body) =>
        Array.isArray(body.sessions)
          ? { status: 'pass', detail: `${body.sessions.length} 个可归档会话` }
          : { status: 'warn', detail: '响应缺 sessions' }),
    },
    {
      id: 'worktree',
      label: 'Worktree API',
      run: async () => {
        if (!ctx.workspace) return { status: 'warn', detail: '跳过：无工作区' }
        return api(`/api/ide/worktree/list?${qs({ repoRoot: ctx.workspace })}`, (body) =>
          Array.isArray(body.worktrees)
            ? { status: 'pass', detail: `${body.worktrees.length} 个 worktree` }
            : { status: 'warn', detail: '响应缺 worktrees' })
      },
    },
  ]

  const results = await Promise.all(checks.map(async (check) => {
    const startedAt = Date.now()
    try {
      const outcome = await withTimeout(check.run, timeoutMs)
      return { id: check.id, label: check.label, ...outcome, ms: Date.now() - startedAt }
    } catch (err) {
      const message = err instanceof Error && err.message === 'timeout'
        ? `超时（>${timeoutMs}ms）`
        : err instanceof Error ? err.message : String(err)
      return { id: check.id, label: check.label, status: 'fail' as const, detail: message, ms: Date.now() - startedAt }
    }
  }))
  return results
}

export function selfCheckSummary(results: SelfCheckResult[]): { pass: number; warn: number; fail: number; total: number } {
  return {
    pass: results.filter(r => r.status === 'pass').length,
    warn: results.filter(r => r.status === 'warn').length,
    fail: results.filter(r => r.status === 'fail').length,
    total: results.length,
  }
}

export function formatSelfCheckReport(results: SelfCheckResult[]): string {
  const s = selfCheckSummary(results)
  const lines = [`IDE 自检：${s.pass} 通过 / ${s.warn} 告警 / ${s.fail} 失败（共 ${s.total}）`, '']
  for (const r of results) {
    lines.push(`[${r.status.toUpperCase()}] ${r.label} (${r.ms}ms) — ${r.detail}`)
  }
  return lines.join('\n')
}

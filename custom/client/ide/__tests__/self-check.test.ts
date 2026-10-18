// @vitest-environment jsdom
// IDE 自检 runner 守门：正常/告警/失败/超时与报告格式。
import { describe, it, expect, vi } from 'vitest'
import {
  IDE_SIDE_PANE_TAB_COUNT,
  formatSelfCheckReport,
  runSelfChecks,
  selfCheckSummary,
  type SelfCheckContext,
} from '../utils/selfCheck'

function makeFetch(overrides: Record<string, { status: number; body: unknown }> = {}) {
  return vi.fn(async (path: string) => {
    const hit = Object.entries(overrides).find(([prefix]) => path.startsWith(prefix))
    const status = hit?.[1].status ?? 200
    const body = hit?.[1].body ?? {}
    return { ok: status >= 200 && status < 400, status, json: async () => body } as Response
  })
}

function ctx(overrides: Partial<SelfCheckContext> = {}): SelfCheckContext & { authFetch: ReturnType<typeof makeFetch> } {
  const authFetch = makeFetch({
    '/api/studio/files/list': { status: 200, body: { entries: [{ name: 'a' }] } },
    '/api/ide/git/status': { status: 200, body: { repoRoot: '/ws', branch: 'main', changes: [] } },
    '/api/ide/storage/snapshot': { status: 200, body: { categories: [{}], partial: false } },
    '/api/ide/slash-commands': { status: 200, body: { commands: [{}] } },
    '/api/ide/automations': { status: 200, body: { rules: [] } },
    '/api/ide/engine-models': { status: 200, body: { config: { providers: [{}] } } },
    '/api/zcode-engine/workflow/saved': { status: 200, body: { workflows: [] } },
    '/api/context-archive/sessions': { status: 200, body: { sessions: [] } },
    '/api/ide/worktree/list': { status: 200, body: { worktrees: [] } },
  })
  return {
    authFetch,
    workspace: '/ws',
    sessionsLoaded: true,
    sessionCount: 2,
    activeSessionId: 's1',
    sidePaneTabs: IDE_SIDE_PANE_TAB_COUNT,
    rawI18nKeys: 0,
    ...overrides,
  } as SelfCheckContext & { authFetch: ReturnType<typeof makeFetch> }
}

describe('runSelfChecks', () => {
  it('健康环境：主链路全部 pass（工作流空列表也算 pass）', async () => {
    const results = await runSelfChecks(ctx())
    const byId = Object.fromEntries(results.map(r => [r.id, r.status]))
    expect(byId['session-store']).toBe('pass')
    expect(byId['files']).toBe('pass')
    expect(byId['git']).toBe('pass')
    expect(byId['workflow']).toBe('pass')
    expect(selfCheckSummary(results).fail).toBe(0)
  })

  it('无会话/无工作区：降级为 warn 并跳过依赖项', async () => {
    const c = ctx({ sessionsLoaded: true, sessionCount: 0, activeSessionId: null, workspace: null, rawI18nKeys: 2 })
    const results = await runSelfChecks(c)
    const byId = Object.fromEntries(results.map(r => [r.id, r]))
    expect(byId['session-store'].status).toBe('warn')
    expect(byId['workspace'].status).toBe('warn')
    expect(byId['files'].status).toBe('warn')
    expect(byId['i18n'].status).toBe('warn')
  })

  it('接口 503/401 记 warn（引擎/鉴权依赖），500 记 fail', async () => {
    const c = ctx()
    c.authFetch = makeFetch({
      '/api/ide/slash-commands': { status: 503, body: { detail: 'engine down' } },
      '/api/ide/automations': { status: 500, body: { detail: 'boom' } },
    }) as never
    const results = await runSelfChecks(c)
    const byId = Object.fromEntries(results.map(r => [r.id, r]))
    expect(byId['slash'].status).toBe('warn')
    expect(byId['automations'].status).toBe('fail')
  })

  it('单检超时：fail 且 detail 标超时', async () => {
    const c = ctx({ timeoutMs: 20 })
    c.authFetch = vi.fn(() => new Promise<Response>(() => {})) as never
    const results = await runSelfChecks(c)
    expect(results.find(r => r.id === 'files')?.status).toBe('fail')
    expect(results.find(r => r.id === 'files')?.detail).toContain('超时')
  })

  it('报告格式：首行汇总 + 每项状态/耗时/明细', async () => {
    const results = await runSelfChecks(ctx())
    const report = formatSelfCheckReport(results)
    expect(report.split('\n')[0]).toContain('IDE 自检')
    expect(report).toContain('[PASS] 文件列表 API')
  })
})

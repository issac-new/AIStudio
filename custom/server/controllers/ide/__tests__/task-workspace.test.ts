// 658 守门：/api/ide/task-workspace 解析纯函数 + 路由行为（router-harness 模式
// =automations-rest 同款）。解析约定镜像 upstream listWorkspaceFiles
// （~/.hermes/kanban[/boards/<slug>]/workspaces 锚定、绝对路径直用）与 CLI
// resolve_workspace（scratch 空 path 预测 <workspacesRoot>/<task-id>）。
import { describe, it, expect, beforeAll, vi } from 'vitest'
import Router from '@koa/router'

interface CtxShape {
  query: Record<string, string>
  get?: (k: string) => string
  status: number
  body: unknown
}

async function run(router: Router, path: string, ctx: Partial<CtxShape>): Promise<CtxShape> {
  const full: CtxShape = { query: {}, get: () => '', status: 200, body: undefined, ...ctx } as CtxShape
  // koa Layer.match 不认查询串——按裸路径匹配，query 全量放 ctx（与控制器读法一致）
  const bare = path.split('?')[0]
  const layer = router.stack.find((l) => l.match(bare))
  expect(layer, `route GET ${bare} exists`).toBeTruthy()
  for (const mw of (layer as unknown as { stack: Array<(c: CtxShape, next?: () => Promise<void>) => Promise<void>> }).stack) {
    await mw(full, async () => {})
  }
  return full
}

const HOME = '/home/u'
const DIRS = new Set(['/home/u/proj/repo', '/home/u/.hermes/kanban/workspaces/t_123'])
const isDir = (p: string) => DIRS.has(p)
const deps = { kanbanHome: `${HOME}/.hermes/kanban`, isDir }

import { resolveTaskWorkspace, boardWorkspacesRoot } from '../task-workspace'

describe('resolveTaskWorkspace（纯解析）', () => {
  it('绝对路径直用（系统级任务在 ~/.hermes 外，如项目仓库根）', () => {
    const r = resolveTaskWorkspace(
      { taskId: 't_1', board: 'default', workspaceKind: 'dir', workspacePath: '/home/u/proj/repo' },
      deps,
    )
    expect(r.path).toBe('/home/u/proj/repo')
    expect(r.materialized).toBe(true)
    expect(r.note).toBe('ok')
  })

  it('相对路径锚定 default 板 workspaces 根', () => {
    const r = resolveTaskWorkspace(
      { taskId: 't_123', board: 'default', workspaceKind: 'scratch', workspacePath: 'workspaces/t_123' },
      deps,
    )
    expect(r.path).toBe(`${HOME}/.hermes/kanban/workspaces/workspaces/t_123`)
    expect(r.note).toBe('ok')
  })

  it('命名板锚定 boards/<slug>/workspaces', () => {
    const r = resolveTaskWorkspace(
      { taskId: 't_9', board: 'aipay-rfd', workspaceKind: 'worktree', workspacePath: 't_9' },
      deps,
    )
    expect(r.path).toBe(`${HOME}/.hermes/kanban/boards/aipay-rfd/workspaces/t_9`)
    expect(r.branch).toBe(null)
  })

  it('scratch 空 path 预测 <workspacesRoot>/<task-id>，materialized 如实 false', () => {
    const r = resolveTaskWorkspace(
      { taskId: 't_new', board: 'default', workspaceKind: 'scratch', workspacePath: null },
      deps,
    )
    expect(r.path).toBe(`${HOME}/.hermes/kanban/workspaces/t_new`)
    expect(r.materialized).toBe(false)
    expect(r.note).toBe('predicted_scratch')
  })

  it('已派发 scratch 命中实体目录 materialized=true（回收后 false 如实）', () => {
    const hit = resolveTaskWorkspace(
      { taskId: 't_123', board: 'default', workspaceKind: 'scratch', workspacePath: 't_123' },
      deps,
    )
    expect(hit.path).toBe(`${HOME}/.hermes/kanban/workspaces/t_123`)
    expect(hit.materialized).toBe(true)
  })

  it('dir/worktree 空 path 不猜（no_workspace）', () => {
    const r = resolveTaskWorkspace(
      { taskId: 't_2', board: 'default', workspaceKind: 'worktree', workspacePath: null },
      deps,
    )
    expect(r.path).toBe(null)
    expect(r.note).toBe('no_workspace')
  })

  it('相对路径 ../ 穿越拒绝（escape_refused）', () => {
    const r = resolveTaskWorkspace(
      { taskId: 't_3', board: 'default', workspaceKind: 'dir', workspacePath: '../../etc' },
      deps,
    )
    expect(r.path).toBe(null)
    expect(r.note).toBe('escape_refused')
  })

  it('branch/status 透传', () => {
    const r = resolveTaskWorkspace(
      { taskId: 't_4', board: 'default', workspaceKind: 'worktree', workspacePath: '/home/u/proj/repo', branchName: 'wt/t_4', status: 'running' },
      deps,
    )
    expect(r.branch).toBe('wt/t_4')
    expect(r.status).toBe('running')
  })

  it('boardWorkspacesRoot 双形态（default/命名板）', () => {
    expect(boardWorkspacesRoot(HOME, 'default')).toBe(`${HOME}/workspaces`)
    expect(boardWorkspacesRoot(HOME, 'b1')).toBe(`${HOME}/boards/b1/workspaces`)
  })
})

describe('GET /api/ide/task-workspace（路由行为）', () => {
  let router: Router
  beforeAll(async () => {
    const mod = await import('../task-workspace')
    router = mod.default as unknown as Router
  })

  it('缺 task 参数 400', async () => {
    const r = await run(router, '/api/ide/task-workspace', {})
    expect(r.status).toBe(400)
  })

  it('任务详情 404 → 404', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 })
    vi.stubGlobal('fetch', fetchMock)
    const r = await run(router, '/api/ide/task-workspace?task=t_x', { query: { task: 't_x' } })
    expect(r.status).toBe(404)
    vi.unstubAllGlobals()
  })

  it('命中任务 → 解析体（path/materialized/note）', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ task: { workspace_kind: 'scratch', workspace_path: null, branch_name: null, status: 'ready' } }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const r = await run(router, '/api/ide/task-workspace?task=t_new&board=default', {
      query: { task: 't_new', board: 'default' },
    })
    expect(r.status).toBe(200)
    const body = r.body as { path: string; materialized: boolean; note: string }
    expect(body.note).toBe('predicted_scratch')
    expect(body.materialized).toBe(false)
    expect(body.path).toMatch(/t_new$/)
    // 自请求带 board 查询参数（default 板省略）
    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url).toContain('/api/hermes/kanban/t_new')
    expect(url).not.toContain('board=')
    vi.unstubAllGlobals()
  })

  it('命名板自请求带 board 参数；鉴权头透传', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ task: { workspace_kind: 'dir', workspace_path: '/home/u/proj/repo' } }),
    })
    vi.stubGlobal('fetch', fetchMock)
    await run(router, '/api/ide/task-workspace?task=t_5&board=aipay-rfd', {
      query: { task: 't_5', board: 'aipay-rfd' },
      get: (k: string) => (k === 'authorization' ? 'Bearer tok' : ''),
    })
    const url = String(fetchMock.mock.calls[0]?.[0])
    const init = fetchMock.mock.calls[0]?.[1] as { headers?: Record<string, string> } | undefined
    expect(url).toContain('board=aipay-rfd')
    expect(init?.headers?.authorization).toBe('Bearer tok')
    vi.unstubAllGlobals()
  })

  it('自请求异常 → 502 不裸炸', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('queue timeout')))
    const r = await run(router, '/api/ide/task-workspace?task=t_z', { query: { task: 't_z' } })
    expect(r.status).toBe(502)
    vi.unstubAllGlobals()
  })
})

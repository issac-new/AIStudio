import { beforeEach, describe, expect, it, vi } from 'vitest'

const handlers = {
  listBoards: vi.fn(async (ctx: any) => { ctx.body = { boards: [] } }),
  createBoard: vi.fn(async (ctx: any) => { ctx.body = { board: {} } }),
  archiveBoard: vi.fn(async (ctx: any) => { ctx.body = { ok: true } }),
  capabilities: vi.fn(async (ctx: any) => { ctx.body = { capabilities: {} } }),
  stats: vi.fn(async (ctx: any) => { ctx.body = { stats: {} } }),
  assignees: vi.fn(async (ctx: any) => { ctx.body = { assignees: [] } }),
  readArtifact: vi.fn(async (ctx: any) => { ctx.body = { content: 'x' } }),
  listAttachments: vi.fn(async (ctx: any) => { ctx.body = { attachments: [] } }),
  readAttachment: vi.fn(async (ctx: any) => { ctx.body = Buffer.from('x') }),
  searchSessions: vi.fn(async (ctx: any) => { ctx.body = { results: [] } }),
  linkTasks: vi.fn(async (ctx: any) => { ctx.body = { ok: true } }),
  unlinkTasks: vi.fn(async (ctx: any) => { ctx.body = { ok: true } }),
  bulkUpdateTasks: vi.fn(async (ctx: any) => { ctx.body = { results: [] } }),
  list: vi.fn(async (ctx: any) => { ctx.body = { tasks: [] } }),
  get: vi.fn(async (ctx: any) => { ctx.body = { task: {} } }),
  create: vi.fn(async (ctx: any) => { ctx.body = { task: {} } }),
  complete: vi.fn(async (ctx: any) => { ctx.body = { ok: true } }),
  unblock: vi.fn(async (ctx: any) => { ctx.body = { ok: true } }),
  block: vi.fn(async (ctx: any) => { ctx.body = { ok: true } }),
  assign: vi.fn(async (ctx: any) => { ctx.body = { ok: true } }),
  addComment: vi.fn(async (ctx: any) => { ctx.body = { ok: true } }),
  taskLog: vi.fn(async (ctx: any) => { ctx.body = { log: '' } }),
  diagnostics: vi.fn(async (ctx: any) => { ctx.body = { diagnostics: [] } }),
  getOrchestration: vi.fn(async (ctx: any) => { ctx.body = { orchestration: {} } }),
  setOrchestration: vi.fn(async (ctx: any) => { ctx.body = { orchestration: {} } }),
  homeChannels: vi.fn(async (ctx: any) => { ctx.body = { channels: [] } }),
  debugHomeChannels: vi.fn(async (ctx: any) => { ctx.body = { debug: [] } }),
  subscribeHome: vi.fn(async (ctx: any) => { ctx.body = { ok: true } }),
  unsubscribeHome: vi.fn(async (ctx: any) => { ctx.body = { ok: true } }),
  listAttachments: vi.fn(async (ctx: any) => { ctx.body = { attachments: [] } }),
  uploadAttachment: vi.fn(async (ctx: any) => { ctx.body = { attachment: {} } }),
  uploadAttachmentFromUrl: vi.fn(async (ctx: any) => { ctx.body = { attachment: {} } }),
  downloadAttachment: vi.fn(async (ctx: any) => { ctx.body = '' }),
  removeAttachment: vi.fn(async (ctx: any) => { ctx.body = { ok: true } }),
  deleteTask: vi.fn(async (ctx: any) => { ctx.body = { ok: true } }),
  patchTask: vi.fn(async (ctx: any) => { ctx.body = { task: {} } }),
  // v0.6.43: vitest 3.x 对 mock 缺失 export 直接抛错，补齐 v0.20 新增 controller 动词
  patchBoard: vi.fn(async (ctx: any) => { ctx.body = { board: {} } }),
  estimateTask: vi.fn(async (ctx: any) => { ctx.body = { estimate: {} } }),
  estimateText: vi.fn(async (ctx: any) => { ctx.body = { estimate: {} } }),
  listProjects: vi.fn(async (ctx: any) => { ctx.body = { projects: [] } }),
  reopenReview: vi.fn(async (ctx: any) => { ctx.body = { ok: true } }),
  decomposeTask: vi.fn(async (ctx: any) => { ctx.body = { result: {} } }),
  listWorkspaceFiles: vi.fn(async (ctx: any) => { ctx.body = { files: [] } }),
  listTimeline: vi.fn(async (ctx: any) => { ctx.body = { timeline: [] } }),
  reclaim: vi.fn(async (ctx: any) => { ctx.body = { ok: true } }),
  reassign: vi.fn(async (ctx: any) => { ctx.body = { ok: true } }),
  specify: vi.fn(async (ctx: any) => { ctx.body = { results: [] } }),
  dispatch: vi.fn(async (ctx: any) => { ctx.body = { result: {} } }),
}

vi.mock('../../packages/server/src/modules/hermes/controllers/kanban', () => handlers)

describe('kanban routes', () => {
  beforeEach(() => {
    vi.resetModules()
    Object.values(handlers).forEach(fn => fn.mockClear())
  })

  it('registers all kanban routes', async () => {
    const { kanbanRoutes } = await import('../../packages/server/src/modules/hermes/routes/kanban')
    const paths = kanbanRoutes.stack.map((entry: any) => entry.path)

    expect(paths).toEqual(expect.arrayContaining([
      '/api/hermes/kanban/boards',
      '/api/hermes/kanban/boards/:slug',
      '/api/hermes/kanban/capabilities',
      '/api/hermes/kanban/stats',
      '/api/hermes/kanban/assignees',
      '/api/hermes/kanban/diagnostics',
      '/api/hermes/kanban/dispatch',
      '/api/hermes/kanban/artifact',
      '/api/hermes/kanban/search-sessions',
      '/api/hermes/kanban/links',
      '/api/hermes/kanban/tasks/bulk',
      '/api/hermes/kanban',
      '/api/hermes/kanban/:id/attachments',
      '/api/hermes/kanban/:id/attachments/:attachmentId',
      '/api/hermes/kanban/:id',
      '/api/hermes/kanban/complete',
      '/api/hermes/kanban/unblock',
      '/api/hermes/kanban/:id/block',
      '/api/hermes/kanban/:id/assign',
      '/api/hermes/kanban/:id/comments',
      '/api/hermes/kanban/:id/log',
      '/api/hermes/kanban/:id/reclaim',
      '/api/hermes/kanban/:id/reassign',
      '/api/hermes/kanban/:id/specify',
    ]))
  })

  it('delegates search-sessions to the controller', async () => {
    const { kanbanRoutes } = await import('../../packages/server/src/modules/hermes/routes/kanban')
    const layer = kanbanRoutes.stack.find((entry: any) => entry.path === '/api/hermes/kanban/search-sessions')
    const ctx: any = { query: { task_id: 'task-1', profile: 'alice' }, body: null, params: {} }

    await layer.stack[0](ctx)

    expect(handlers.searchSessions).toHaveBeenCalledWith(ctx)
    expect(ctx.body).toEqual({ results: [] })
  })
})

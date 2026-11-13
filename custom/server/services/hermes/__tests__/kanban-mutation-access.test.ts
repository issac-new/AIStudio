// @vitest-environment node
// 超级智能体吸收批一（spec 2026-11-13-superagent-contract-closure，补丁 770）：
// PATCH/DELETE/decompose 三写入口与 complete/block 同权——隐藏 profile 404 且 CLI
// 零调用；board 走 requestBoard 400；super_admin 无额外 getTask 预读。
// mock 面先例=overview-access.test.ts（kanban-service＋users 双 mock，读注入态源码）。
import { beforeEach, describe, expect, it, vi } from 'vitest'

const deps = vi.hoisted(() => ({
  getTask: vi.fn(),
  deleteTask: vi.fn(),
  patchTask: vi.fn(),
  decomposeTask: vi.fn(),
  listUserProfiles: vi.fn(),
}))

vi.mock('../../../../../vendor/hermes-studio/packages/server/src/modules/hermes/services/kanban/kanban-service', async importOriginal => ({
  ...await importOriginal(),
  normalizeBoardSlug: (board?: string | null) => board?.trim() || 'default',
  getTask: deps.getTask,
  deleteTask: deps.deleteTask,
  patchTask: deps.patchTask,
  decomposeTask: deps.decomposeTask,
}))
vi.mock('../../../../../vendor/hermes-studio/packages/server/src/modules/studio/public/users', async importOriginal => ({
  ...await importOriginal(),
  listUserProfiles: deps.listUserProfiles,
}))

import * as ctrl from '../../../../../vendor/hermes-studio/packages/server/src/modules/hermes/controllers/kanban'

function ctxFor(user: any, opts: { board?: string; body?: any } = {}): any {
  return {
    params: { id: 't-1' },
    query: { board: opts.board ?? 'default' },
    request: { body: opts.body ?? {} },
    state: user ? { user } : {},
    status: 200,
    body: null as any,
  }
}

const HIDDEN_DETAIL = { task: { id: 't-1', assignee: 'bob-agent', status: 'todo' }, runs: [] }
const VISIBLE_DETAIL = { task: { id: 't-1', assignee: 'alice-agent', status: 'todo' }, runs: [] }

// [标签, handler, 对应 CLI spy]——三入口共用同一授权断言面。
const ENTRYPOINTS: Array<[string, (ctx: any) => Promise<void>, keyof typeof deps]> = [
  ['deleteTask', (ctx: any) => ctrl.deleteTask(ctx), 'deleteTask'],
  ['patchTask', (ctx: any) => ctrl.patchTask(ctx), 'patchTask'],
  ['decomposeTask', (ctx: any) => ctrl.decomposeTask(ctx), 'decomposeTask'],
]

beforeEach(() => {
  vi.clearAllMocks()
  // admin 绑定 alice-agent：bob-agent 的卡对其隐藏（补丁 716 同一可见性口径）。
  deps.listUserProfiles.mockReturnValue([{ profile_name: 'alice-agent' }])
  deps.getTask.mockResolvedValue(HIDDEN_DETAIL)
  deps.deleteTask.mockResolvedValue(true)
  deps.patchTask.mockResolvedValue(VISIBLE_DETAIL.task)
  deps.decomposeTask.mockResolvedValue({ created: 2 })
})

describe('批一补丁 770：三写入口授权一致化', () => {
  it.each(ENTRYPOINTS)('%s：隐藏 profile 任务 404 且副作用零调用', async (_label, handler, spyKey) => {
    const ctx = ctxFor({ id: 7, role: 'admin' })
    await handler(ctx)
    expect(ctx.status).toBe(404)
    expect(ctx.body).toEqual({ error: 'Task not found' })
    expect(deps[spyKey]).not.toHaveBeenCalled()
  })

  it.each(ENTRYPOINTS)('%s：同 profile 任务授权通过并调用 CLI', async (_label, handler, spyKey) => {
    deps.getTask.mockResolvedValue(VISIBLE_DETAIL)
    const ctx = ctxFor({ id: 7, role: 'admin' })
    await handler(ctx)
    expect(ctx.status).toBe(200)
    expect(deps[spyKey]).toHaveBeenCalledTimes(1)
    expect(deps.getTask).toHaveBeenCalledWith('t-1', { board: 'default' })
  })

  it.each(ENTRYPOINTS)('%s：非法 board 400 且零副作用', async (_label, handler, spyKey) => {
    const ctx = ctxFor({ id: 7, role: 'admin' }, { board: '   ' })
    await handler(ctx)
    expect(ctx.status).toBe(400)
    expect(deps.getTask).not.toHaveBeenCalled()
    expect(deps[spyKey]).not.toHaveBeenCalled()
  })

  it('super_admin 授权直过（无 getTask 预读）；任务不存在沿用 CLI 错误映射 500', async () => {
    deps.deleteTask.mockRejectedValue(new Error('Task not found'))
    const ctx = ctxFor({ id: 9, role: 'super_admin' })
    await ctrl.deleteTask(ctx)
    expect(deps.getTask).not.toHaveBeenCalled()
    expect(deps.deleteTask).toHaveBeenCalledTimes(1)
    expect(ctx.status).toBe(500)
    expect(ctx.body).toEqual({ error: 'Task not found' })
  })

  it('super_admin 正常删除走通 200', async () => {
    const ctx = ctxFor({ id: 9, role: 'super_admin' })
    await ctrl.deleteTask(ctx)
    expect(ctx.status).toBe(200)
    expect(ctx.body).toEqual({ ok: true })
    expect(deps.deleteTask).toHaveBeenCalledWith('t-1', { board: 'default' })
  })
})

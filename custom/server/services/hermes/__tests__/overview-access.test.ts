// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { createServer, type Server } from 'node:http'
import { EventEmitter } from 'node:events'
import { WebSocket } from 'ws'
import { createFleetRouter } from '../../../controllers/hermes/fleet'
import { createKanbanOverview } from '../kanban-overview'

const ordinaryKanbanDeps = vi.hoisted(() => ({ listTasks: vi.fn(), listUserProfiles: vi.fn() }))
vi.mock('../../../../../vendor/hermes-studio/packages/server/src/modules/hermes/services/kanban/kanban-service', async importOriginal => ({
  ...await importOriginal(),
  normalizeBoardSlug: (board?: string | null) => board?.trim() || 'default',
  listTasks: ordinaryKanbanDeps.listTasks,
}))
vi.mock('../../../../../vendor/hermes-studio/packages/server/src/modules/studio/public/users', async importOriginal => ({
  ...await importOriginal(),
  listUserProfiles: ordinaryKanbanDeps.listUserProfiles,
}))

interface TestUser { id: number; role: string; username?: string; profiles?: string[] }

function overviewHandler(raw: any) {
  const router = createFleetRouter({
    buildSnapshot: () => [],
    respondApproval: async () => ({ resolved: true }),
    respondClarify: async () => ({ resolved: true }),
    getSession: () => null,
    getOverview: async () => raw,
    teams: {
      list: async () => [],
      create: async input => input,
      update: async (_id, patch) => patch,
      remove: async () => true,
    },
    userCanAccessProfile: (userId, profile) => (
      (userId === 1 && ['default', 'alice-agent'].includes(profile))
      || (userId === 2 && ['default', 'bob-agent'].includes(profile))
      || (userId === 4 && profile === 'alice-agent')
    ),
  })
  const layer = router.stack.find(item => item.path === '/api/hermes/kanban/overview')
  const handler = layer?.stack.at(-1)
  if (!handler) throw new Error('overview route missing')
  return handler
}

function ctxFor(user: TestUser | null): any {
  return { state: user ? { user } : {}, status: 200, body: null }
}

describe('overview 账户授权投影', () => {
  it('两个账户复用同一原始缓存时各自只看 assignee 可见任务，板计数由各自任务重算', async () => {
    const raw = {
      boards: [{ slug: 'main', name: 'Main', total: 99, archived: false }],
      tasks: [
        { board: 'main', task: { id: 'A-1', title: 'alice secret', assignee: 'alice-agent' } },
        { board: 'main', task: { id: 'B-1', title: 'bob secret', assignee: 'bob-agent' } },
        { board: 'main', task: { id: 'D-1', title: 'default task', assignee: null } },
      ],
      fetchedAt: 123,
    }
    const handler = overviewHandler(raw)

    const alice = ctxFor({ id: 1, role: 'user' })
    await handler(alice)
    expect(alice.body.tasks.map((row: any) => row.task.id)).toEqual(['A-1', 'D-1'])
    expect(alice.body.boards).toEqual([{ slug: 'main', name: 'Main', total: 2, archived: false }])

    const bob = ctxFor({ id: 2, role: 'user' })
    await handler(bob)
    expect(bob.body.tasks.map((row: any) => row.task.id)).toEqual(['B-1', 'D-1'])
    expect(bob.body.boards).toEqual([{ slug: 'main', name: 'Main', total: 2, archived: false }])
    // 投影不得把第一账户的过滤结果写回共享原始对象。
    expect(raw.tasks).toHaveLength(3)
    expect(raw.boards[0].total).toBe(99)
  })

  it('未指派输入与普通 Kanban 对照：未指派卡不滤（补丁 547），空映射不限制（477）', async () => {
    const sharedTasks = [
      { id: 'U-1', title: 'unassigned', assignee: null, status: 'blocked' },
      { id: 'A-1', title: 'alice task', assignee: 'alice-agent', status: 'todo' },
      { id: 'B-1', title: 'bob task', assignee: 'bob-agent', status: 'done' },
    ]
    ordinaryKanbanDeps.listTasks.mockResolvedValue(sharedTasks)
    ordinaryKanbanDeps.listUserProfiles.mockReturnValue([{ profile_name: 'alice-agent' }])
    const ordinaryKanban = await import('../../../../../vendor/hermes-studio/packages/server/src/modules/hermes/controllers/kanban')
    const ordinaryCtx: any = {
      query: { board: 'default' }, state: { user: { id: 4, role: 'user' } }, status: 200, body: null,
    }
    await ordinaryKanban.list(ordinaryCtx)
    // 普通 Kanban（注入后）：未指派卡不滤、assignee 仍按可见集过滤（实测定谳）。
    expect(ordinaryCtx.body.tasks.map((task: any) => task.id)).toEqual(['U-1', 'A-1'])

    const raw = {
      boards: [{ slug: 'default', name: 'Default', total: 3, archived: false }],
      tasks: sharedTasks.map(task => ({ board: 'default', task })),
      fetchedAt: 123,
    }
    const projected = ctxFor({ id: 4, role: 'user', profiles: ['alice-agent'] })
    await overviewHandler(raw)(projected)
    expect(projected.body.tasks.map((row: any) => row.task.id)).toEqual(ordinaryCtx.body.tasks.map((task: any) => task.id))

    // user_profiles 空集（477 同款豁免）：不限制，与普通 Kanban 行为一致。
    const nobody = ctxFor({ id: 3, role: 'user', profiles: [] })
    await overviewHandler({ ...raw, tasks: [raw.tasks[0]] })(nobody)
    expect(nobody.body.tasks.map((row: any) => row.task.id)).toEqual(['U-1'])
  })

  it('空板按 profiles 优先、profile_scope 回落的团队交集可见，legacy 空板保留空投影', async () => {
    const raw = {
      boards: [
        { slug: 'profiles-a', name: 'A', total: 0, archived: false, profiles: ['alice-agent'] },
        { slug: 'scope-b', name: 'B', total: 0, archived: false, profile_scope: ['bob-agent'] },
        { slug: 'preferred', name: 'P', total: 0, archived: false, profiles: ['bob-agent'], profile_scope: ['alice-agent'] },
        { slug: 'present-empty', name: 'E', total: 0, archived: false, profiles: [], profile_scope: ['alice-agent', 'bob-agent'] },
        { slug: 'legacy', name: 'L', total: 0, archived: false },
      ],
      tasks: [],
      fetchedAt: 123,
    }
    const handler = overviewHandler(raw)

    const alice = ctxFor({ id: 1, role: 'user' })
    await handler(alice)
    expect(alice.body.boards.map((board: any) => board.slug)).toEqual(['profiles-a', 'legacy'])

    const bob = ctxFor({ id: 2, role: 'user' })
    await handler(bob)
    expect(bob.body.boards.map((board: any) => board.slug)).toEqual(['scope-b', 'preferred', 'legacy'])
  })

  it('已认证但无任何可见 profile 时不返回任务、团队空板或原始计数', async () => {
    const raw = {
      boards: [
        { slug: 'legacy', name: 'Legacy', total: 7, archived: false },
        { slug: 'secret-team', name: 'Secret', total: 4, archived: false, profiles: ['bob-agent'] },
      ],
      tasks: [
        { board: 'legacy', task: { id: 'B-1', title: 'not visible', assignee: 'bob-agent' } },
        { board: 'secret-team', task: { id: 'B-2', title: 'also invisible', assignee: 'bob-agent' } },
      ],
      fetchedAt: 123,
    }
    const ctx = ctxFor({ id: 3, role: 'user' })
    await overviewHandler(raw)(ctx)
    expect(ctx.body.tasks).toEqual([])
    expect(ctx.body.boards).toEqual([{ slug: 'legacy', name: 'Legacy', total: 0, archived: false }])
  })

  it('super_admin 与无鉴权本地部署保留全量任务、空板和原始计数', async () => {
    const raw = {
      boards: [
        { slug: 'main', name: 'Main', total: 9, archived: false },
        { slug: 'unassigned', name: 'Empty', total: 0, archived: false, profiles: [] },
      ],
      tasks: [
        { board: 'main', task: { id: 'A-1', assignee: 'alice-agent' } },
        { board: 'main', task: { id: 'B-1', assignee: 'bob-agent' } },
      ],
      fetchedAt: 123,
    }
    const handler = overviewHandler(raw)
    for (const ctx of [ctxFor({ id: 9, role: 'super_admin' }), ctxFor(null)]) {
      await handler(ctx)
      expect(ctx.body.tasks.map((row: any) => row.task.id)).toEqual(['A-1', 'B-1'])
      expect(ctx.body.boards.map((board: any) => board.slug)).toEqual(['main', 'unassigned'])
      expect(ctx.body.boards[0].total).toBe(9)
    }
  })
})

describe('overview WebSocket 授权投影', () => {
  it('同一板事件只推给投影中仍可见该板的账户', async () => {
    const children = new Map<string, any>()
    const overview = createKanbanOverview({
      listBoards: async () => [
        { slug: 'alpha', name: 'Alpha', total: 0, archived: false, profiles: ['alice-agent'] },
        { slug: 'beta', name: 'Beta', total: 0, archived: false, profiles: ['bob-agent'] },
      ],
      listTasks: async () => [],
      watchEvents: (opts) => {
        const child = new EventEmitter() as any
        child.pid = children.size + 100
        child.stdout = new EventEmitter()
        child.kill = vi.fn()
        children.set(opts?.board || 'default', child)
        return child
      },
      killWatch: (_pid, fallback) => fallback(),
    })
    const server: Server = createServer()
    let ws: WebSocket | null = null
    try {
      await overview.getOverview() // 共享原始缓存；不得按首个连接账户改写。
      overview.attachWebSocket(server, {
        isAuthEnabled: async () => true,
        authenticateUserToken: async token => token === 'alice-token' ? { id: 1, role: 'user' } : null,
        userCanAccessProfile: (userId, profile) => userId === 1 && profile === 'alice-agent',
      } as any)
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('test server address missing')
      const messages: any[] = []
      ws = new WebSocket(`ws://127.0.0.1:${address.port}/api/hermes/kanban/overview/events?token=alice-token`)
      ws.on('message', data => messages.push(JSON.parse(data.toString())))
      await new Promise<void>((resolve, reject) => {
        ws!.once('open', resolve)
        ws!.once('error', reject)
      })
      await vi.waitFor(() => {
        if (!messages.some(message => message.type === 'connected')) throw new Error('connected message missing')
        if (children.size !== 2) throw new Error('board watchers not ready')
      })

      children.get('beta').stdout.emit('data', '{"kind":"task","id":"B-1"}\n')
      children.get('alpha').stdout.emit('data', '{"kind":"task","id":"A-1"}\n')
      await vi.waitFor(() => {
        if (!messages.some(message => message.type === 'board-event' && message.board === 'alpha')) {
          throw new Error('visible board event missing')
        }
      })
      await new Promise(resolve => setTimeout(resolve, 30))
      expect(messages.filter(message => message.type === 'board-event').map(message => message.board)).toEqual(['alpha'])
    } finally {
      ws?.terminate()
      await overview.stop()
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })

  it('raw 只有他人任务时不发事件，raw 变真空板后恢复现有通知', async () => {
    const children = new Map<string, any>()
    let legacyTasks: any[] = [{ id: 'B-1', title: 'hidden activity', assignee: 'bob-agent' }]
    const overview = createKanbanOverview({
      listBoards: async () => [{ slug: 'legacy', name: 'Legacy', total: 1, archived: false }],
      listTasks: async () => [...legacyTasks],
      watchEvents: (opts) => {
        const child = new EventEmitter() as any
        child.pid = 200
        child.stdout = new EventEmitter()
        child.kill = vi.fn()
        children.set(opts?.board || 'default', child)
        return child
      },
      killWatch: (_pid, fallback) => fallback(),
    })
    const server: Server = createServer()
    let ws: WebSocket | null = null
    try {
      await overview.getOverview()
      overview.attachWebSocket(server, {
        isAuthEnabled: async () => true,
        authenticateUserToken: async () => ({ id: 1, role: 'user', profiles: ['alice-agent'] }),
        userCanAccessProfile: (userId, profile) => userId === 1 && profile === 'alice-agent',
      } as any)
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('test server address missing')
      const messages: any[] = []
      ws = new WebSocket(`ws://127.0.0.1:${address.port}/api/hermes/kanban/overview/events?token=alice-token`)
      ws.on('message', data => messages.push(JSON.parse(data.toString())))
      await new Promise<void>((resolve, reject) => {
        ws!.once('open', resolve)
        ws!.once('error', reject)
      })
      await vi.waitFor(() => {
        if (!messages.some(message => message.type === 'connected')) throw new Error('connected message missing')
        if (children.size !== 1) throw new Error('board watcher not ready')
      })

      children.get('legacy').stdout.emit('data', '{"kind":"task","id":"B-1"}\n')
      await new Promise(resolve => setTimeout(resolve, 40))
      expect(messages.filter(message => message.type === 'board-event')).toEqual([])

      legacyTasks = []
      children.get('legacy').stdout.emit('data', '{"kind":"task","id":"B-1","status":"archived"}\n')
      // 第二条事件落在 watcher 的 2s 事件合并窗内，flush 由合并定时器延后触发。
      await vi.waitFor(() => {
        if (!messages.some(message => message.type === 'board-event' && message.board === 'legacy')) {
          throw new Error('empty board event missing')
        }
      }, { timeout: 4_000 })
      expect(messages.filter(message => message.type === 'board-event').map(message => message.board)).toEqual(['legacy'])
    } finally {
      ws?.terminate()
      await overview.stop()
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })
})

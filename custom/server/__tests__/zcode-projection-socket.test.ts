// overlay/custom/server/__tests__/zcode-projection-socket.test.ts
// S3 守门：/zcode 命名空间鉴权——客户端送 handshake.auth.token，服务端必须校验，
// 无 token / 坏 token 一律 next(err) 拒绝连接；isAuthEnabled 关闭时放行（upstream
// pet-state.ts authMiddleware 同款语义）。接法锚：upstream sockets/pet-state.ts。
// X1 收口：subscribe/subscribe-session 进房另过归属闸（canUseWorkspace）——跨用户
// 不进房（不泄跨 workspace 元数据），本人/可见会话进房；未启用鉴权放行（单用户部署）。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Server, Socket } from 'socket.io'
import { setupZcodeProjectionSocket, type ZcodeNamespaceAuth } from '../zcode/projection-socket'
import { setWorkspaceAccessDepsForTests } from '../zcode/workspace-access'

function fakeIo() {
  const nsp = {
    use: vi.fn(),
    on: vi.fn(),
    to: vi.fn(() => ({ emit: vi.fn() })),
  }
  const io = { of: vi.fn(() => nsp) } as unknown as Server
  return { io, nsp }
}

function fakeSocket(auth: Record<string, unknown>): { handshake: { auth: unknown }; data: Record<string, unknown> } {
  return { handshake: { auth }, data: {} }
}

type NspMiddleware = (socket: Socket, next: (err?: Error) => void) => void | Promise<void>

function setupWith(authDeps: ZcodeNamespaceAuth): NspMiddleware {
  const { io, nsp } = fakeIo()
  setupZcodeProjectionSocket(io, authDeps)
  expect(nsp.use).toHaveBeenCalledTimes(1) // 鉴权中间件先于 connection 处理器注册
  return nsp.use.mock.calls[0][0] as NspMiddleware
}

describe('/zcode 命名空间鉴权（S3）', () => {
  it('无 token 拒绝连接：next(err)，不放行', async () => {
    const mw = setupWith({
      isAuthEnabled: async () => true,
      authenticateUserToken: async () => null,
    })
    const next = vi.fn()
    await mw(fakeSocket({}) as unknown as Socket, next)
    expect(next).toHaveBeenCalledTimes(1)
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error)
  })

  it('坏 token 同样拒绝；好 token 放行并落到 socket.data.user', async () => {
    const mw = setupWith({
      isAuthEnabled: async () => true,
      authenticateUserToken: async (token: string) => (token === 'good-token' ? { id: 7, role: 'user' } : null),
    })
    const badNext = vi.fn()
    await mw(fakeSocket({ token: 'bad' }) as unknown as Socket, badNext)
    expect(badNext.mock.calls[0][0]).toBeInstanceOf(Error)

    const okSocket = fakeSocket({ token: 'good-token' })
    const okNext = vi.fn()
    await mw(okSocket as unknown as Socket, okNext)
    expect(okNext).toHaveBeenCalledWith()
    expect(okSocket.data.user).toMatchObject({ id: 7 })
  })

  it('isAuthEnabled 关闭时放行（与 upstream sockets 同款语义）；校验抛错按拒绝处理', async () => {
    const offMw = setupWith({
      isAuthEnabled: async () => false,
      authenticateUserToken: async () => null,
    })
    const offNext = vi.fn()
    await offMw(fakeSocket({}) as unknown as Socket, offNext)
    expect(offNext).toHaveBeenCalledWith()

    const throwMw = setupWith({
      isAuthEnabled: async () => true,
      authenticateUserToken: async () => { throw new Error('db down') },
    })
    const throwNext = vi.fn()
    await throwMw(fakeSocket({ token: 'x' }) as unknown as Socket, throwNext)
    expect(throwNext.mock.calls[0][0]).toBeInstanceOf(Error)
  })

  it('鉴权面不可用（缺省懒加载失败）时 fail closed：拒绝所有连接', async () => {
    const { io, nsp } = fakeIo()
    // 不注入 authDeps：缺省懒加载 upstream auth。加载失败或不可达时必须拒绝而不是放行。
    const realError = console.error
    console.error = vi.fn()
    try {
      setupZcodeProjectionSocket(io) // 加载失败路径不炸 setup，连接期 fail closed
    } finally {
      console.error = realError
    }
    const mw = nsp.use.mock.calls[0][0] as NspMiddleware
    const next = vi.fn()
    await mw(fakeSocket({ token: 'whatever' }) as unknown as Socket, next)
    // 无注入 + 懒加载成功则走真实校验（坏 token 拒）；懒加载失败则直接拒——两者都不放行
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error)
  })
})

describe('/zcode 订阅房间归属（X1 收口）', () => {
  type SocketHandler = (...args: string[]) => void

  /** 走完鉴权中间件（socket.data.user 由鉴权面写入）再进 connection 处理器，取事件处理器与 join 探针。 */
  async function connectWith(authDeps: ZcodeNamespaceAuth, token?: string): Promise<{
    handlers: Map<string, SocketHandler>
    join: ReturnType<typeof vi.fn>
    leave: ReturnType<typeof vi.fn>
  }> {
    const { io, nsp } = fakeIo()
    setupZcodeProjectionSocket(io, authDeps)
    const mw = nsp.use.mock.calls[0][0] as NspMiddleware
    const handlers = new Map<string, SocketHandler>()
    const join = vi.fn()
    const leave = vi.fn()
    const socket = {
      handshake: { auth: token === undefined ? {} : { token } },
      data: {} as Record<string, unknown>,
      on: (evt: string, fn: SocketHandler) => { handlers.set(evt, fn) },
      join,
      leave,
    }
    const next = vi.fn()
    await mw(socket as unknown as Socket, next)
    expect(next).toHaveBeenCalledWith() // 鉴权通过（拒绝路径由 S3 守门覆盖）
    const onConnection = nsp.on.mock.calls.find((c) => c[0] === 'connection')?.[1] as ((s: Socket) => void) | undefined
    expect(onConnection).toBeTypeOf('function')
    onConnection!(socket as unknown as Socket)
    return { handlers, join, leave }
  }

  const authed: ZcodeNamespaceAuth = {
    isAuthEnabled: async () => true,
    authenticateUserToken: async (token: string) => (token === 'good-token' ? { id: 7, username: 'alice', role: 'admin' } : null),
  }
  const registeredDeps = {
    listSessions: () => [{ profile: 'default', workspace: '/w/p' }, { profile: 'ops', workspace: '/w/ops' }],
    userCanAccessProfile: (_id: number | string, profile: string) => profile === 'default',
  }

  beforeEach(() => { setWorkspaceAccessDepsForTests(registeredDeps) })
  afterEach(() => { setWorkspaceAccessDepsForTests(null) })

  it('跨用户 subscribe 不进房：未注册 / 他人 profile 的 workspace 静默拒，join 零调用（不泄跨 workspace 元数据）', async () => {
    const { handlers, join } = await connectWith(authed, 'good-token')
    handlers.get('subscribe')!('/w/other') // 未注册于 Studio 会话注册表
    handlers.get('subscribe')!('/w/ops') // 已注册但 profile 对调用方不可见
    handlers.get('subscribe-session')!('/w/other', 's1')
    handlers.get('subscribe-session')!('/w/ops', 's1')
    expect(join).not.toHaveBeenCalled()
  })

  it('本人可见 workspace：subscribe 进 workspace 级房间，subscribe-session 进会话级房间', async () => {
    const { handlers, join } = await connectWith(authed, 'good-token')
    handlers.get('subscribe')!('/w/p')
    handlers.get('subscribe-session')!('/w/p', 's1')
    expect(join.mock.calls.map((c) => c[0])).toEqual(['zcode:/w/p', 'zcode:/w/p:s:s1'])
  })

  it('super_admin 跨 workspace 直通；未启用鉴权（socket.data.user 缺席）放行（单用户部署口径）', async () => {
    const asRoot = await connectWith({
      isAuthEnabled: async () => true,
      authenticateUserToken: async () => ({ id: 1, username: 'root', role: 'super_admin' }),
    }, 'any-token')
    asRoot.handlers.get('subscribe')!('/w/ops')
    asRoot.handlers.get('subscribe-session')!('/w/other', 's9')
    expect(asRoot.join.mock.calls.map((c) => c[0])).toEqual(['zcode:/w/ops', 'zcode:/w/other:s:s9'])

    const anon = await connectWith({ isAuthEnabled: async () => false, authenticateUserToken: async () => null })
    anon.handlers.get('subscribe')!('/w/anywhere')
    expect(anon.join).toHaveBeenCalledWith('zcode:/w/anywhere')
  })
})

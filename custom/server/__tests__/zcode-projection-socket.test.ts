// overlay/custom/server/__tests__/zcode-projection-socket.test.ts
// S3 守门：/zcode 命名空间鉴权——客户端送 handshake.auth.token，服务端必须校验，
// 无 token / 坏 token 一律 next(err) 拒绝连接；isAuthEnabled 关闭时放行（upstream
// pet-state.ts authMiddleware 同款语义）。接法锚：upstream sockets/pet-state.ts。
import { describe, it, expect, vi } from 'vitest'
import type { Server, Socket } from 'socket.io'
import { setupZcodeProjectionSocket, type ZcodeNamespaceAuth } from '../zcode/projection-socket'

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

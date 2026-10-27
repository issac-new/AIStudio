// 批三 D1 守门：mapnotes socket 广播语义——setup 后 emitMapnotesEvent 投递到正确
// 指纹房间（spy 断言 namespace/房间/事件形状）、未 setup 时静默零异常。
// 注：socket.io 网络层（真实建连收发）由 spec 验证段的冒烟脚本承载（vite-node
// 实证绿）；vitest worker 环境的 socket.io-client 网络栈行为异常（连接建立但订阅
// 不生效，同代码 vite-node 直跑全绿——环境差异实录），故本文件只守广播语义不建真连。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import http from 'node:http'
import type { Server } from 'socket.io'
import { setupMapnotesSocket, emitMapnotesEvent } from '../mapnotes-socket'

let httpServer: http.Server | null = null
let ioServer: Server | null = null

beforeEach(async () => {
  const { Server: IOServer } = await import('socket.io')
  httpServer = http.createServer()
  ioServer = new IOServer(httpServer, { path: '/socket.io' })
  await new Promise<void>((res) => httpServer!.listen(0, '127.0.0.1', res))
})
afterEach(async () => {
  await new Promise<void>((res) => ioServer!.close(() => res()))
  await new Promise<void>((res) => httpServer!.close(() => res()))
})

describe('emitMapnotesEvent（房间广播语义）', () => {
  it('setup 后：upsert/delete 投递到 mapnotes:<指纹> 房间，事件形状正确', () => {
    setupMapnotesSocket(ioServer!, { isAuthEnabled: () => false, authenticateUserToken: () => null })
    const nsp = ioServer!.of('/mapnotes')
    const roomEmit = vi.fn()
    nsp.to = vi.fn(() => ({ emit: roomEmit } as never) as never)
    emitMapnotesEvent({ kind: 'upsert', key: 'a1b2c3d4e5', annotation: { nodeId: 'n1', note: 'x', checked: true, by: 'alice', at: 1, rev: 1 }, applied: true })
    expect(nsp.to).toHaveBeenCalledWith('mapnotes:a1b2c3d4e5')
    expect(roomEmit).toHaveBeenCalledWith('mapnotes:changed',
      expect.objectContaining({ kind: 'upsert', key: 'a1b2c3d4e5', annotation: expect.objectContaining({ nodeId: 'n1', rev: 1 }) }))
    emitMapnotesEvent({ kind: 'delete', key: 'ffffffffff', nodeId: 'gone', by: 'bob' })
    expect(nsp.to).toHaveBeenLastCalledWith('mapnotes:ffffffffff')
    expect(roomEmit).toHaveBeenLastCalledWith('mapnotes:changed',
      expect.objectContaining({ kind: 'delete', key: 'ffffffffff', nodeId: 'gone' }))
  })

  it('未 setup（activeIo 缺席）→ 静默零异常（无连接面=无人需要实时同步）', () => {
    // 本用例不 setup；若同 worker 上一用例已写入 activeIo 则退化为不炸——语义均成立
    expect(() => emitMapnotesEvent({ kind: 'delete', key: 'x', nodeId: 'y', by: 'z' })).not.toThrow()
  })
})

// C2 守门：zcode 投影扇出单编码多房间（opencode v2「encode once, N queues」的
// socket.io 对应形态）。
// 契约：带 sessionId/taskId 的事件只 emit 一次（链式 .to 房间并集），不再逐房间
// 逐包（旧形态同 socket 双房间订阅会重复收包 + 重复序列化）；房间并集含全部目标。
import { describe, it, expect } from 'vitest'
import { emitZcodeProjectionEvent } from '../projection-socket'

interface BroadcastMock {
  rooms: string[]
  emit: (event: string, payload: unknown) => void
  to: (room: string) => BroadcastMock
}
function makeIo() {
  const emitCalls: Array<{ event: string; payload: unknown }> = []
  const ofMock = { to: (room: string) => makeBroadcast([room]) }
  function makeBroadcast(rooms: string[]): BroadcastMock {
    return {
      rooms,
      emit: (event: string, payload: unknown) => emitCalls.push({ event, payload }),
      to: (room: string) => makeBroadcast([...rooms, room]),
    }
  }
  return { io: { of: () => ofMock }, emitCalls }
}

describe('C2 投影扇出：单 emit 房间并集', () => {
  it('带 sessionId + taskId 的事件：一次 emit（不再是 3 次逐房间）', () => {
    const { io, emitCalls } = makeIo()
    emitZcodeProjectionEvent(io as never, {
      type: 'session.upserted', workspaceId: '/w', sessionId: 's1', taskId: 't1',
    } as never)
    expect(emitCalls.length).toBe(1)
    expect(emitCalls[0].event).toBe('zcode:event')
  })

  it('仅 workspace 级事件：同样一次 emit', () => {
    const { io, emitCalls } = makeIo()
    emitZcodeProjectionEvent(io as never, { type: 'projection.status', workspaceId: '/w' } as never)
    expect(emitCalls.length).toBe(1)
  })

  it('io 缺席：静默不炸', () => {
    expect(() => emitZcodeProjectionEvent(null, { type: 'projection.status', workspaceId: '/w' } as never)).not.toThrow()
  })
})

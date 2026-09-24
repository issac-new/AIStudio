// overlay[zcode] R4-P2：zcode 会话投影的 socket.io 数据面（/zcode 命名空间）。
//
// 模式复刻 loop-socket（custom/server/loop/services/loop-socket.ts）：连接进
// join 房间、emit 助手供各子系统扇出。房间两级：
//   zcode:<workspacePath>                     —— workspace 级（sessions-index / status）
//   zcode:<workspacePath>:s:<sessionId>       —— 会话级（conversation.frame）
// 事件名 zcode:event，payload = session-projection.ts 的 ProjectionEvent
// （含 DispatchReasonCode 词表值，cockpit chip 按字面值本地化）。
import type { Server, Socket } from 'socket.io'
import type { ProjectionEvent } from './session-projection'

let activeIo: Server | null = null

export function setupZcodeProjectionSocket(io: Server): void {
  activeIo = io
  const nsp = io.of('/zcode')

  nsp.on('connection', (socket: Socket) => {
    socket.on('subscribe', (workspacePath: string) => {
      if (typeof workspacePath === 'string' && workspacePath.length > 0) socket.join(`zcode:${workspacePath}`)
    })
    socket.on('unsubscribe', (workspacePath: string) => {
      if (typeof workspacePath === 'string') socket.leave(`zcode:${workspacePath}`)
    })
    socket.on('subscribe-session', (workspacePath: string, sessionId: string) => {
      if (typeof workspacePath === 'string' && typeof sessionId === 'string' && sessionId.length > 0) {
        socket.join(`zcode:${workspacePath}:s:${sessionId}`)
      }
    })
    socket.on('unsubscribe-session', (workspacePath: string, sessionId: string) => {
      if (typeof workspacePath === 'string' && typeof sessionId === 'string') {
        socket.leave(`zcode:${workspacePath}:s:${sessionId}`)
      }
    })
  })
}

/** 扇出：workspace 级房间必投；带 sessionId 的事件加投会话级房间。io 缺席时静默（无连接面）。 */
export function emitZcodeProjectionEvent(io: Server | null | undefined, event: ProjectionEvent): void {
  const target = io ?? activeIo
  if (!target) return
  const rooms = [`zcode:${event.workspaceId}`]
  if ('sessionId' in event && event.sessionId) rooms.push(`zcode:${event.workspaceId}:s:${event.sessionId}`)
  for (const room of rooms) target.of('/zcode').to(room).emit('zcode:event', event)
}

// overlay/custom/client/zcode/api/zcode-socket.ts
// /zcode 命名空间客户端（对齐 loop/api/loop-socket.ts 同款模式）。
// 事件面 = 服务端 projection-socket.ts 的 zcode:event（ProjectionEvent | MentionOutcome，
// 携带 dispatch-reasons 词表字面值，chip 按字面值本地化）。
import { io, type Socket } from 'socket.io-client'
import { getApiKey, getBaseUrlValue } from '@/api/client'
import type { ZcodeSocketEvent } from '../store/zcode-projection'

let zcodeSocket: Socket | null = null

export function connectZcode(): Socket {
  // 复用判据是「实例存在」而非 .connected：重连 backoff 窗口内 connected=false，
  // 此时另起新实例会让旧实例重连成功后成孤儿（双通道、事件翻倍），交由 socket.io
  // reconnection 自愈。确需换新只能先 disconnectZcode()（disconnect 旧实例后置空）。
  if (zcodeSocket) return zcodeSocket
  const baseUrl = getBaseUrlValue() || window.location.origin
  const token = getApiKey()
  zcodeSocket = io(`${baseUrl}/zcode`, {
    auth: { token: token || undefined },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30000,
  })
  return zcodeSocket
}

export function disconnectZcode(): void {
  // 换新实例前必须先 disconnect 旧实例（否则旧实例重连成功后成孤儿双通道）。
  if (zcodeSocket) {
    zcodeSocket.disconnect()
    zcodeSocket = null
  }
}

/**
 * 订阅 workspace 事件面：登记 zcode:event 监听 + subscribe 房间，返回清理函数。
 * 清理函数精确 off 本次登记的两个监听并退订同一 workspacePath，调用方（组件卸载/
 * 换 workspace）必须调用——否则监听器随挂载次数累积、计数被 N 倍累加。
 * 断线重连后服务端是全新 socket、房间关系丢失，挂 connect 事件幂等重订
 * （服务端 subscribe 即 socket.join，重复订阅无副作用），避免事件静默断供。
 */
export function subscribeZcodeWorkspace(
  socket: Socket,
  workspacePath: string,
  onEvent: (e: ZcodeSocketEvent) => void,
): () => void {
  const resubscribe = () => { socket.emit('subscribe', workspacePath) }
  socket.on('zcode:event', onEvent)
  socket.on('connect', resubscribe)
  resubscribe()
  return () => {
    socket.off('zcode:event', onEvent)
    socket.off('connect', resubscribe)
    socket.emit('unsubscribe', workspacePath)
  }
}

export function subscribeZcodeSession(socket: Socket, workspacePath: string, sessionId: string): void {
  socket.emit('subscribe-session', workspacePath, sessionId)
}

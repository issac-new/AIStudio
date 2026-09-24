// overlay/custom/client/zcode/api/zcode-socket.ts
// /zcode 命名空间客户端（对齐 loop/api/loop-socket.ts 同款模式）。
// 事件面 = 服务端 projection-socket.ts 的 zcode:event（ProjectionEvent | MentionOutcome，
// 携带 dispatch-reasons 词表字面值，chip 按字面值本地化）。
import { io, type Socket } from 'socket.io-client'
import { getApiKey, getBaseUrlValue } from '@/api/client'
import type { ZcodeSocketEvent } from '../store/zcode-projection'

let zcodeSocket: Socket | null = null

export function connectZcode(): Socket {
  if (zcodeSocket?.connected) return zcodeSocket
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
  if (zcodeSocket) {
    zcodeSocket.disconnect()
    zcodeSocket = null
  }
}

export function subscribeZcodeWorkspace(socket: Socket, workspacePath: string, onEvent: (e: ZcodeSocketEvent) => void): void {
  socket.emit('subscribe', workspacePath)
  socket.on('zcode:event', onEvent)
}

export function subscribeZcodeSession(socket: Socket, workspacePath: string, sessionId: string): void {
  socket.emit('subscribe-session', workspacePath, sessionId)
}

export function unsubscribeZcodeWorkspace(socket: Socket, workspacePath: string): void {
  socket.emit('unsubscribe', workspacePath)
}

// overlay/custom/client/loop/api/loop-socket.ts
import { io, type Socket } from 'socket.io-client'
import type { LoopEvent } from '../types'

let loopSocket: Socket | null = null

export function connectLoop(): Socket {
  if (loopSocket?.connected) return loopSocket
  const baseUrl = window.location.origin
  loopSocket = io(`${baseUrl}/loop`, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30000,
  })
  return loopSocket
}

export function disconnectLoop(): void {
  if (loopSocket) {
    loopSocket.disconnect()
    loopSocket = null
  }
}

export function subscribeToLoop(socket: Socket, loopId: string, onEvent: (event: LoopEvent) => void): void {
  socket.emit('subscribe', loopId)
  socket.on('loop:event', onEvent)
  socket.on('loop:history', (events: LoopEvent[]) => {
    events.forEach(onEvent)
  })
}

export function unsubscribeFromLoop(socket: Socket, loopId: string): void {
  socket.emit('unsubscribe', loopId)
}

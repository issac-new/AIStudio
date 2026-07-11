// overlay/custom/server/loop/services/loop-socket.ts
//
// Socket.IO namespace handler for Loop Engineering.
//
// Registers the `/loop` namespace on the existing Socket.IO Server instance
// (the same one shared by group-chat / chat-run / workflow / pet-state sockets
// in packages/server/src/index.ts). Clients subscribe to a specific loop's
// event stream by emitting `subscribe` with a loopId; the server joins them
// to a `loop:<id>` room and replays the last 50 events as `loop:history`.
//
// `emitLoopEvent(io, event)` is the write-side helper other subsystems call
// to fan an event out to every subscriber of `event.loopId`.
import type { Server, Socket } from 'socket.io'
import type { LoopStateStore } from '../store/state-store'

export function setupLoopSocketNamespace(io: Server, store: LoopStateStore): void {
  const nsp = io.of('/loop')

  nsp.on('connection', (socket: Socket) => {
    // Client subscribes to a loop's events
    socket.on('subscribe', (loopId: string) => {
      socket.join(`loop:${loopId}`)
      // Send recent events on connect
      store.queryEvents(loopId, undefined, 50).then(events => {
        socket.emit('loop:history', events)
      })
    })

    socket.on('unsubscribe', (loopId: string) => {
      socket.leave(`loop:${loopId}`)
    })
  })
}

export function emitLoopEvent(io: Server, event: { loopId?: string; type: string }): void {
  if (event.loopId) {
    io.of('/loop').to(`loop:${event.loopId}`).emit('loop:event', event)
  }
}

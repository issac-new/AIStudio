// overlay/custom/server/loop/services/loop-socket.ts
//
// Socket.IO namespace handler for Loop Engineering.
//
// Registers the `/loop` namespace on the existing Socket.IO Server instance
// (the same one shared by group-chat / chat-run / workflow / pet-state sockets
// in packages/server/src/index.ts). Clients subscribe to a specific loop's
// event stream by emitting `subscribe` with a loopId; the server joins them
// to a `loop:<id>` room and (when a store is provided) replays the last 50
// events as `loop:history`.
//
// `store` is OPTIONAL: the REST subsystem (patch 134) already owns the live
// LoopStateStore singleton (created by createStateStore() in store-factory).
// Persistence is handled by `loopStore.appendEvent(event)` in the emitEvent
// closure, and broadcasting is handled by `emitLoopEvent(io, event)`. The
// socket namespace only needs the store to replay history on subscribe — if
// no store is passed, subscribe simply joins the room without sending history.
//
// `emitLoopEvent(io, event)` is the write-side helper other subsystems call
// to fan an event out to every subscriber of `event.loopId`.
import type { Server, Socket } from 'socket.io'
import type { LoopStateStore } from '../store/state-store'

export function setupLoopSocketNamespace(io: Server, store?: LoopStateStore | null): void {
  const nsp = io.of('/loop')

  nsp.on('connection', (socket: Socket) => {
    // Client subscribes to a loop's events
    socket.on('subscribe', (loopId: string) => {
      socket.join(`loop:${loopId}`)
      // Send recent events on connect (only if a store was provided — the
      // REST subsystem owns the live store singleton; the socket namespace
      // is a read-only fan-out for live events).
      if (store) {
        store.queryEvents(loopId, undefined, 50).then(events => {
          socket.emit('loop:history', events)
        }).catch(() => { /* ignore replay errors */ })
      }
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

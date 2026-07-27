/**
 * In-process broadcast transport.
 *
 * Holds a Node EventEmitter that `server/sse.ts` subscribes to. Listeners
 * receive every (post-redaction) record. The broadcaster is global so any
 * sink can push, and the server can subscribe once.
 */
import { EventEmitter } from "node:events";
const bus = new EventEmitter();
bus.setMaxListeners(64);
export const LOG_BROADCAST_EVENT = "log";
export function onBroadcastLog(listener) {
    bus.on(LOG_BROADCAST_EVENT, listener);
    return () => bus.off(LOG_BROADCAST_EVENT, listener);
}
export function broadcastLog(record) {
    bus.emit(LOG_BROADCAST_EVENT, record);
}
export class SseBroadcastTransport {
    name = "sse-broadcast";
    accepts(_record) {
        return true;
    }
    write(record) {
        try {
            bus.emit(LOG_BROADCAST_EVENT, record);
        }
        catch {
            // never throw
        }
    }
}
//# sourceMappingURL=sse-broadcast.js.map
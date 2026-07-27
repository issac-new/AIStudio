/**
 * In-process broadcast transport.
 *
 * Holds a Node EventEmitter that `server/sse.ts` subscribes to. Listeners
 * receive every (post-redaction) record. The broadcaster is global so any
 * sink can push, and the server can subscribe once.
 */
import type { LogRecord, Transport } from "../types.js";
export type LogListener = (record: LogRecord) => void;
export declare const LOG_BROADCAST_EVENT = "log";
export declare function onBroadcastLog(listener: LogListener): () => void;
export declare function broadcastLog(record: LogRecord): void;
export declare class SseBroadcastTransport implements Transport {
    readonly name = "sse-broadcast";
    accepts(_record: LogRecord): boolean;
    write(record: LogRecord): void;
}
//# sourceMappingURL=sse-broadcast.d.ts.map
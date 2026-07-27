/**
 * Bounded in-memory ring buffer.
 *
 * Powers `/api/logs/tail?live=false` and the in-process self-check. Holds the
 * last `capacity` records (default 1024) per category.
 */
import type { LogKind, LogLevel, LogRecord, Transport } from "../types.js";
export interface MemoryBufferOptions {
    capacity?: number;
}
export declare class MemoryBufferTransport implements Transport {
    readonly name = "memory-buffer";
    private readonly capacity;
    private readonly records;
    constructor(opts?: MemoryBufferOptions);
    accepts(_record: LogRecord): boolean;
    write(record: LogRecord): void;
    /** Snapshot the buffer (most recent first). */
    tail(filter?: {
        level?: LogLevel;
        channel?: string;
        kind?: LogKind;
        limit?: number;
    }): LogRecord[];
    size(): number;
}
//# sourceMappingURL=memory-buffer.d.ts.map
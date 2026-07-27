/**
 * Perf sink → logs/perf.jsonl. Records emitted by `logger.timer(...)` end up
 * here regardless of channel level (they're a separate firehose).
 *
 * Sampling: applied at the timer call site so this sink itself just writes.
 */
import type { LogRecord, Sink, Transport } from "../types.js";
export declare class PerfLogSink implements Sink {
    private readonly transports;
    readonly name = "perf";
    constructor(transports: Transport[]);
    accepts(record: LogRecord): boolean;
    write(record: LogRecord): void;
    flush(): Promise<void>;
    close(): Promise<void>;
}
//# sourceMappingURL=perf-log.d.ts.map
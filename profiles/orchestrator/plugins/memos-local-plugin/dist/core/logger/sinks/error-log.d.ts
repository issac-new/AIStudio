/**
 * Error-only sink → logs/error.log. Captures every WARN/ERROR/FATAL across
 * every channel so triage is one file away.
 */
import type { LogRecord, Sink, Transport } from "../types.js";
export declare class ErrorLogSink implements Sink {
    private readonly transports;
    readonly name = "error";
    constructor(transports: Transport[]);
    accepts(record: LogRecord): boolean;
    write(record: LogRecord): void;
    flush(): Promise<void>;
    close(): Promise<void>;
}
//# sourceMappingURL=error-log.d.ts.map
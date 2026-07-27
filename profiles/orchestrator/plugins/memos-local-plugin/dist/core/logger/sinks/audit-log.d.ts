/**
 * Audit sink → logs/audit.log.
 *
 * Permanent retention: monthly gzip rotation, never delete. The transport
 * passed in here MUST be configured with `keepForever: true`
 * (`mode: "audit"`).
 */
import type { LogRecord, Sink, Transport } from "../types.js";
export declare class AuditLogSink implements Sink {
    private readonly transports;
    readonly name = "audit";
    constructor(transports: Transport[]);
    accepts(record: LogRecord): boolean;
    write(record: LogRecord): void;
    flush(): Promise<void>;
    close(): Promise<void>;
}
//# sourceMappingURL=audit-log.d.ts.map
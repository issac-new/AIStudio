/**
 * Console transport. Writes pretty (TTY) or JSON/compact (non-TTY) to
 * stdout/stderr. Channel filtering is handled at the sink layer.
 */
import type { LogRecord, Transport } from "../types.js";
export interface ConsoleTransportOptions {
    pretty: boolean;
    /** When `pretty` is false, choose JSON or compact for non-TTY. */
    format?: "json" | "compact";
    /** Override TTY detection (tests). */
    isTty?: boolean;
}
export declare class ConsoleTransport implements Transport {
    readonly name = "console";
    private readonly pretty;
    private readonly format;
    private readonly isTty;
    private readonly color;
    constructor(opts: ConsoleTransportOptions);
    accepts(_record: LogRecord): boolean;
    write(record: LogRecord): void;
    flush(): void;
    close(): void;
}
//# sourceMappingURL=console.d.ts.map
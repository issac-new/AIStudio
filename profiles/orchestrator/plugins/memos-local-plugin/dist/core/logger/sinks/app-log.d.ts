/**
 * App sink: routes "app" + "events" + "perf" + "audit" + "llm" + "error"
 * records that should ALSO appear in the human-readable main log to
 * `logs/memos.log`.
 *
 * That is: every record except the binary firehose ones (we let those go to
 * their own dedicated jsonl files via separate sinks).
 */
import type { LogRecord, Sink, Transport } from "../types.js";
export declare class AppLogSink implements Sink {
    private readonly transports;
    readonly name = "app";
    constructor(transports: Transport[]);
    accepts(record: LogRecord): boolean;
    write(record: LogRecord): void;
    flush(): Promise<void>;
    close(): Promise<void>;
}
//# sourceMappingURL=app-log.d.ts.map
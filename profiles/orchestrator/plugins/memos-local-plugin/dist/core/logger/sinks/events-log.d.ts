/**
 * Events sink → logs/events.jsonl. Mirrors every CoreEvent the algorithm
 * emits as a `LogRecord` with `kind === "events"`.
 */
import type { LogRecord, Sink, Transport } from "../types.js";
export declare class EventsLogSink implements Sink {
    private readonly transports;
    readonly name = "events";
    constructor(transports: Transport[]);
    accepts(record: LogRecord): boolean;
    write(record: LogRecord): void;
    flush(): Promise<void>;
    close(): Promise<void>;
}
//# sourceMappingURL=events-log.d.ts.map
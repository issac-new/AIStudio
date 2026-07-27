/**
 * LLM call sink → logs/llm.jsonl. Every record with `kind === "llm"` lands
 * here. The payload includes provider/model/op/latency/tokens/(prompt+
 * completion if not redacted).
 */
import type { LogRecord, Sink, Transport } from "../types.js";
export declare class LlmLogSink implements Sink {
    private readonly transports;
    readonly name = "llm";
    constructor(transports: Transport[]);
    accepts(record: LogRecord): boolean;
    write(record: LogRecord): void;
    flush(): Promise<void>;
    close(): Promise<void>;
}
//# sourceMappingURL=llm-log.d.ts.map
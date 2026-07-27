/**
 * LLM call sink → logs/llm.jsonl. Every record with `kind === "llm"` lands
 * here. The payload includes provider/model/op/latency/tokens/(prompt+
 * completion if not redacted).
 */
export class LlmLogSink {
    transports;
    name = "llm";
    constructor(transports) {
        this.transports = transports;
    }
    accepts(record) {
        return record.kind === "llm";
    }
    write(record) {
        for (const t of this.transports) {
            if (t.accepts(record))
                t.write(record);
        }
    }
    async flush() {
        for (const t of this.transports)
            await t.flush?.();
    }
    async close() {
        for (const t of this.transports)
            await t.close?.();
    }
}
//# sourceMappingURL=llm-log.js.map
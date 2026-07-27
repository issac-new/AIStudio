/**
 * App sink: routes "app" + "events" + "perf" + "audit" + "llm" + "error"
 * records that should ALSO appear in the human-readable main log to
 * `logs/memos.log`.
 *
 * That is: every record except the binary firehose ones (we let those go to
 * their own dedicated jsonl files via separate sinks).
 */
export class AppLogSink {
    transports;
    name = "app";
    constructor(transports) {
        this.transports = transports;
    }
    accepts(record) {
        // Anything app-flavored or important enough to appear in memos.log
        return record.kind === "app" || record.kind === "audit" || record.kind === "error";
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
//# sourceMappingURL=app-log.js.map
/**
 * Events sink → logs/events.jsonl. Mirrors every CoreEvent the algorithm
 * emits as a `LogRecord` with `kind === "events"`.
 */
export class EventsLogSink {
    transports;
    name = "events";
    constructor(transports) {
        this.transports = transports;
    }
    accepts(record) {
        return record.kind === "events";
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
//# sourceMappingURL=events-log.js.map
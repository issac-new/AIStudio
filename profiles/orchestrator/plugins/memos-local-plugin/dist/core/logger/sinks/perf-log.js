/**
 * Perf sink → logs/perf.jsonl. Records emitted by `logger.timer(...)` end up
 * here regardless of channel level (they're a separate firehose).
 *
 * Sampling: applied at the timer call site so this sink itself just writes.
 */
export class PerfLogSink {
    transports;
    name = "perf";
    constructor(transports) {
        this.transports = transports;
    }
    accepts(record) {
        return record.kind === "perf";
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
//# sourceMappingURL=perf-log.js.map
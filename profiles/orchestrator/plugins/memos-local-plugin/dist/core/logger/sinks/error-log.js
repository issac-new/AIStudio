/**
 * Error-only sink → logs/error.log. Captures every WARN/ERROR/FATAL across
 * every channel so triage is one file away.
 */
import { LOG_LEVEL_ORDER } from "../levels.js";
export class ErrorLogSink {
    transports;
    name = "error";
    constructor(transports) {
        this.transports = transports;
    }
    accepts(record) {
        return LOG_LEVEL_ORDER[record.level] >= LOG_LEVEL_ORDER.warn;
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
//# sourceMappingURL=error-log.js.map
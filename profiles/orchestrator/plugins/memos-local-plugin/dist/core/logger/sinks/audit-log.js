/**
 * Audit sink → logs/audit.log.
 *
 * Permanent retention: monthly gzip rotation, never delete. The transport
 * passed in here MUST be configured with `keepForever: true`
 * (`mode: "audit"`).
 */
export class AuditLogSink {
    transports;
    name = "audit";
    constructor(transports) {
        this.transports = transports;
    }
    accepts(record) {
        return record.kind === "audit";
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
//# sourceMappingURL=audit-log.js.map
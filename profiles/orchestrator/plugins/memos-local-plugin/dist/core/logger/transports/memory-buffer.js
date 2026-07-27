/**
 * Bounded in-memory ring buffer.
 *
 * Powers `/api/logs/tail?live=false` and the in-process self-check. Holds the
 * last `capacity` records (default 1024) per category.
 */
export class MemoryBufferTransport {
    name = "memory-buffer";
    capacity;
    records = [];
    constructor(opts = {}) {
        this.capacity = Math.max(64, opts.capacity ?? 1024);
    }
    accepts(_record) {
        return true;
    }
    write(record) {
        this.records.push(record);
        if (this.records.length > this.capacity) {
            this.records.splice(0, this.records.length - this.capacity);
        }
    }
    /** Snapshot the buffer (most recent first). */
    tail(filter) {
        const limit = Math.max(1, filter?.limit ?? 200);
        let acc = [];
        for (let i = this.records.length - 1; i >= 0 && acc.length < limit; i--) {
            const r = this.records[i];
            if (filter?.level && r.level !== filter.level)
                continue;
            if (filter?.kind && r.kind !== filter.kind)
                continue;
            if (filter?.channel && !(r.channel === filter.channel || r.channel.startsWith(filter.channel + ".")))
                continue;
            acc.push(r);
        }
        return acc;
    }
    size() {
        return this.records.length;
    }
}
//# sourceMappingURL=memory-buffer.js.map
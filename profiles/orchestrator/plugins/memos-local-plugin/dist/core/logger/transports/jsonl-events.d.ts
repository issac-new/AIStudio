/**
 * Append-only JSONL transport.
 *
 * Used by `events-log` and `llm-log` and `perf-log` sinks: those are pure
 * machine-consumed streams where rotation by date is enough (no size cap),
 * and we *do* want to keep history for as long as possible — only gzipping
 * older files to save space.
 *
 * Implementation note: under the hood this is just `FileRotatingTransport`
 * with `maxSizeMb=0` (date-only rotation) and a "keep forever" mode toggle.
 */
import { FileRotatingTransport } from "./file-rotating.js";
export interface JsonlEventsOptions {
    filePath: string;
    /** Default: forever. */
    keepForever?: boolean;
    /** When `keepForever` is false, archives older than this many days get pruned. */
    retentionDays?: number;
    gzip?: boolean;
}
export declare class JsonlEventsTransport extends FileRotatingTransport {
    constructor(opts: JsonlEventsOptions);
}
//# sourceMappingURL=jsonl-events.d.ts.map
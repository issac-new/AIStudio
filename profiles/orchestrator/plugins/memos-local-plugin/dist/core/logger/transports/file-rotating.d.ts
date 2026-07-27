/**
 * File transport with size + date rotation and optional gzip on rotation.
 *
 * Writes are append-only. Rotation triggers when EITHER:
 *   - the current file's size exceeds `maxSizeMb`, or
 *   - the calendar day (UTC) has changed since the file was opened.
 *
 * On rotation:
 *   - Active file is closed.
 *   - Renamed to `<base>.YYYY-MM-DD[.N].log` (or `.jsonl`).
 *   - Optionally gzipped.
 *   - When `maxFiles` is positive, oldest archives beyond that count are
 *     deleted. (Does NOT apply when `mode` is "audit"; audit is permanent.)
 *
 * The transport is intentionally synchronous (`appendFileSync`) — logging
 * latency dominates LLM call time anyway, and we want crash-safety without
 * complexity.
 */
import type { LogRecord, Transport } from "../types.js";
export interface FileRotatingOptions {
    /** Absolute path of the active file (e.g. `…/logs/memos.log`). */
    filePath: string;
    /** "json" emits one JSON object per line. "compact" emits k=v pairs. */
    format: "json" | "compact";
    /** Rotate when the file exceeds this size. Set to 0 to disable size rotation. */
    maxSizeMb: number;
    /** Maximum archived files to keep ("forever" if 0). */
    maxFiles: number;
    /** gzip archived files. */
    gzip: boolean;
    /**
     * When "audit", never delete archives regardless of `maxFiles`. We still
     * rotate (monthly), still gzip, but archives stay forever.
     */
    mode?: "default" | "audit";
}
export declare class FileRotatingTransport implements Transport {
    private readonly opts;
    readonly name: string;
    private fd;
    private openedAt;
    private openedSizeBytes;
    private writtenSinceCheck;
    private readonly maxSizeBytes;
    constructor(opts: FileRotatingOptions);
    accepts(_record: LogRecord): boolean;
    write(record: LogRecord): void;
    flush(): void;
    close(): void;
    private writeText;
    private openIfNeeded;
    private shouldRotateBeforeWrite;
    private rotate;
    private pruneOldArchives;
}
//# sourceMappingURL=file-rotating.d.ts.map
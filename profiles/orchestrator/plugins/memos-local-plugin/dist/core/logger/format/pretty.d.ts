/**
 * Human-friendly console formatter. Used in dev when `logging.console.pretty`
 * is true. Doesn't try to be fancy: timestamp + level + channel + msg + a
 * single-line `key=val` summary of `data`.
 *
 * Colors are applied only when stdout is a TTY (so piping to a file stays clean).
 */
import type { LogRecord } from "../types.js";
export declare function formatPretty(record: LogRecord, opts: {
    color: boolean;
}): string;
//# sourceMappingURL=pretty.d.ts.map
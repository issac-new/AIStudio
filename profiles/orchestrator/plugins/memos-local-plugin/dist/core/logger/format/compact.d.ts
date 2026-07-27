/**
 * Single-line, key=value compact format. Useful in CI / docker logs where
 * JSON noise would drown the signal but you still want machine-grep-ability.
 */
import type { LogRecord } from "../types.js";
export declare function formatCompact(record: LogRecord): string;
//# sourceMappingURL=compact.d.ts.map
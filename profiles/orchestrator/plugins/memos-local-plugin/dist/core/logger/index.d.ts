/**
 * Logger factory + global root logger.
 *
 *   const log = rootLogger.child({ channel: "core.l2.cross-task" });
 *   log.info("induce.start", { episodes: ids.length });
 *
 * On first import, the module starts in a "console-only" pre-init mode so
 * even early imports can log safely. Once the runtime has resolved a config,
 * call `initLogger(config, paths)` to wire up file/SSE/audit/llm/perf/events
 * sinks.
 *
 * `initLogger` is idempotent — re-init swaps the active root in place so
 * existing `child()` instances keep working.
 */
import type { Logger } from "./types.js";
import { MemoryBufferTransport } from "./transports/memory-buffer.js";
import type { ResolvedConfig } from "../config/schema.js";
import type { ResolvedHome } from "../config/paths.js";
export interface InitLoggerOptions {
    /** When true, omit file sinks (used by tests via `tmp-home`-less calls). */
    filesEnabled?: boolean;
    /** When true, omit the SSE broadcaster (rare). */
    broadcastEnabled?: boolean;
}
export declare function initLogger(config: ResolvedConfig, home: ResolvedHome, opts?: InitLoggerOptions): void;
/** Switch to a silent test logger. */
export declare function initTestLogger(): void;
export declare function flushLogger(): Promise<void>;
export declare function shutdownLogger(): Promise<void>;
export declare function memoryBuffer(): MemoryBufferTransport;
export declare const rootLogger: Logger;
//# sourceMappingURL=index.d.ts.map
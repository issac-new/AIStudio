/**
 * Level helpers. Re-exports the canonical level enum from the contract layer
 * and provides comparisons + per-channel resolution.
 */
import { LOG_LEVELS, LOG_LEVEL_ORDER, type LogLevel } from "../../agent-contract/log-record.js";
export { LOG_LEVELS, LOG_LEVEL_ORDER };
export type { LogLevel };
export declare function levelGte(a: LogLevel, b: LogLevel): boolean;
export declare function isValidLevel(s: string): s is LogLevel;
export declare function parseLevel(s: string, fallback?: LogLevel): LogLevel;
/**
 * Resolve the effective level for `channel` given the global level and a
 * channel→level overrides map. Longest-prefix wins; fall back to global.
 *
 *   overrides = { "core.l2": "debug", "core.l2.cross-task": "trace" }
 *   resolveLevelForChannel("core.l2.cross-task", "info", overrides) === "trace"
 *   resolveLevelForChannel("core.l2.incremental", "info", overrides) === "debug"
 *   resolveLevelForChannel("core.session", "info", overrides) === "info"
 */
export declare function resolveLevelForChannel(channel: string, globalLevel: LogLevel, overrides: Record<string, string>): LogLevel;
//# sourceMappingURL=levels.d.ts.map
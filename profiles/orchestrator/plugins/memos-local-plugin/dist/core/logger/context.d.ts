/**
 * Per-async-flow context propagation. Modules that want their `traceId`,
 * `sessionId`, `episodeId`, `turnId`, etc. attached to every log automatically
 * wrap their work in `withCtx({...}, fn)`.
 *
 * Backed by Node's `AsyncLocalStorage` so callbacks, `await`s, and timers all
 * inherit the right context.
 */
import type { LogContext } from "../../agent-contract/log-record.js";
/** Get the current ambient context (or `undefined` if none). */
export declare function getCtx(): LogContext | undefined;
/**
 * Run `fn` with the merged context. Existing fields are kept unless overridden.
 * Returns whatever `fn` returns (preserves async).
 */
export declare function withCtx<T>(patch: Partial<LogContext>, fn: () => T): T;
/** Set or replace ambient context for the current async flow. */
export declare function setCtx(patch: Partial<LogContext>): void;
/**
 * Convenience: ensure a `traceId` exists in the current scope, generating
 * one if not. Returns the resolved id.
 */
export declare function ensureTraceId(): string;
//# sourceMappingURL=context.d.ts.map
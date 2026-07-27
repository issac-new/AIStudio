/**
 * Wire shape of a single log line. This is the type non-TypeScript adapters
 * (e.g. Hermes' Python `log_forwarder.py`) serialize when forwarding their
 * own logs back through the bridge so everything ends up in the same files.
 */
export const LOG_LEVELS = ["trace", "debug", "info", "warn", "error", "fatal"];
/** Numeric ordering for level comparisons. */
export const LOG_LEVEL_ORDER = Object.freeze({
    trace: 10,
    debug: 20,
    info: 30,
    warn: 40,
    error: 50,
    fatal: 60,
});
/**
 * Stable shape for one structured log entry.
 *
 *   - `channel` is a dotted path: `<area>.<sub>.<verb-or-noun>`
 *   - `kind` lets a sink decide which file to append to ("app" → memos.log,
 *     "audit" → audit.log, "llm" → llm.jsonl, etc.)
 *   - `ctx` carries traceId/sessionId/episodeId/turnId/userId/agent so SSE
 *     consumers can stitch logs together
 *   - `data` is the structured payload (already redacted)
 *   - `err` is present only for errors and is a fully serialized error
 */
export const LOG_KINDS = ["app", "audit", "llm", "perf", "events", "error"];
//# sourceMappingURL=log-record.js.map
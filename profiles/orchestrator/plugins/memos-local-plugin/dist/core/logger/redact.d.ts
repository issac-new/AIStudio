/**
 * Redaction layer.
 *
 * Every record passes through here BEFORE any transport sees it. We mutate a
 * deep clone of `data` / `ctx`, never the original input.
 *
 * Default rules:
 *   - Any object key whose name (case-insensitive) matches an entry in
 *     `extraKeys` gets its value replaced with `"[redacted]"`.
 *   - Any string value matching common secret patterns (Bearer token, JWT,
 *     `sk-…` keys, email, phone, full file path) is masked.
 *
 * Users can extend `extraKeys` and `extraPatterns` from `config.yaml`.
 */
import type { LogRecord } from "../../agent-contract/log-record.js";
export interface RedactOptions {
    extraKeys: string[];
    extraPatterns: string[];
}
export interface RedactedLogRecord extends LogRecord {
    /** When at least one field changed, we mark the record so consumers can tell. */
    _redacted?: boolean;
}
export declare class Redactor {
    private readonly keyPatterns;
    private readonly valuePatterns;
    constructor(opts: RedactOptions);
    redact(record: LogRecord): RedactedLogRecord;
    private deep;
    private deepErr;
    private isSecretKey;
    private maskString;
}
//# sourceMappingURL=redact.d.ts.map
/**
 * Centralized time helpers. The whole codebase reads `now()` rather than
 * touching `Date.now()` directly, so tests can monkey-patch the clock in one
 * place if needed.
 */
export type EpochMs = number;
export declare function now(): EpochMs;
/**
 * Override the clock source. Returns a restore function. Intended for tests:
 *
 * ```ts
 * const restore = setNow(() => 1_700_000_000_000);
 * try { ... } finally { restore(); }
 * ```
 */
export declare function setNow(fn: () => EpochMs): () => void;
/** Monotonic high-resolution clock (ms, fractional). Independent of `now()`. */
export declare function hrNowMs(): number;
/** Format a millisecond duration into a short human string ("12ms" / "1.2s" / "3m4s"). */
export declare function formatDurationMs(ms: number): string;
/** Convenience: ISO 8601 string for a given epoch ms (UTC). */
export declare function isoFromEpochMs(ms: EpochMs): string;
//# sourceMappingURL=time.d.ts.map
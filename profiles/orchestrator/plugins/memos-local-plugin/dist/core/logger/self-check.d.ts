/**
 * Startup self-check.
 *
 * Called by `core/pipeline/orchestrator.ts` right after `initLogger`. It
 * writes a probe record to every active sink, then asserts:
 *
 *   - the memory ring contains the probe (proves dispatch works)
 *   - if file sinks are active, `memos.log` exists and is writable
 *   - audit log exists and is mode 600 (or close-enough on Windows)
 *   - the SSE broadcaster has at least our subscriber slot
 *
 * Result is appended to `logs/self-check.log` (a tiny human-readable trail).
 *
 * Failures DO NOT throw — they downgrade to console-only and emit one ERROR
 * record so the user sees the problem in `error.log`.
 */
import type { ResolvedHome } from "../config/paths.js";
export interface SelfCheckResult {
    ok: boolean;
    details: Record<string, boolean | string>;
}
export declare function runSelfCheck(home: ResolvedHome): Promise<SelfCheckResult>;
//# sourceMappingURL=self-check.d.ts.map
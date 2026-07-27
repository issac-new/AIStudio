/**
 * Stable content signature for L1 traces — matches capture's dedupe key so
 * skill evidence gathering ignores orphan duplicate rows (see diagnose.md).
 */
import type { TraceRow } from "../types.js";
export declare function traceIdentitySignature(row: TraceRow, anchorTurnId: number): string;
//# sourceMappingURL=trace-identity.d.ts.map
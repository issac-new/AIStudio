/**
 * Signature derivation for L2 candidate pool bucketing.
 *
 * Two traces from different tasks share a signature when they *look like*
 * instances of the same sub-problem — same primary domain tag, same tool,
 * same error code. This is the cheap pre-filter before any cosine
 * comparison (`similarity.ts`).
 *
 * Signature format: `<primaryTag>|<secondaryTag>|<tool>|<errCode>` with
 * underscores filling in missing components. See `types.ts`.
 */
import type { TraceRow } from "../../types.js";
import type { PatternSignature, SignatureComponents } from "./types.js";
export declare function signatureOf(trace: TraceRow): PatternSignature;
export declare function componentsToSignature(c: SignatureComponents): PatternSignature;
export declare function componentsOf(trace: TraceRow): SignatureComponents;
/** Utility — a parser so downstream logs can show the four parts. */
export declare function parseSignature(sig: PatternSignature): SignatureComponents | null;
/**
 * A looser "bucket key" used when promoting candidates — when
 * primaryTag + errCode match we accept joint induction even if the second
 * tag or tool differ. This is V7 §2.4.5 "different tasks, same sub-problem":
 * e.g. Alpine+lxml and Debian+psycopg2 share `pip|MODULE_NOT_FOUND`.
 */
export declare function bucketKeyOf(trace: TraceRow): PatternSignature;
//# sourceMappingURL=signature.d.ts.map
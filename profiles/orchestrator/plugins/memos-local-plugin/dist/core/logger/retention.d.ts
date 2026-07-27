/**
 * Retention helpers.
 *
 * Most retention is enforced inside `FileRotatingTransport` (size+date+gzip,
 * `maxFiles`). This file is the place to express RETENTION POLICIES (per
 * sink) so we have a single sheet of glass to audit.
 */
import type { ResolvedConfig } from "../config/schema.js";
export interface RetentionPolicy {
    /** sink name */
    sink: string;
    /** human description (for `docs/LOGGING.md`). */
    description: string;
    /** rotation by size (MB) — 0 means date-only. */
    maxSizeMb: number;
    /** number of archives to keep — 0 means forever. */
    maxFiles: number;
    /** gzip on rotation. */
    gzip: boolean;
}
export declare function policiesFor(cfg: ResolvedConfig): RetentionPolicy[];
//# sourceMappingURL=retention.d.ts.map
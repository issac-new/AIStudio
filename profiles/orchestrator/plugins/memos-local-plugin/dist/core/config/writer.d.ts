/**
 * Safe writer for `config.yaml`.
 *
 * Goals:
 *   - Preserve user's comments and field ordering (we use the YAML CST).
 *   - Validate after merge — never write an invalid file.
 *   - Atomic write (tmp file + rename) so a crash never leaves a half-written
 *     config.
 *   - Re-apply `chmod 600` on every write.
 */
import type { ResolvedHome } from "./paths.js";
import { type ResolvedConfig } from "./index.js";
export interface PatchConfigResult {
    config: ResolvedConfig;
    /** Bytes written. */
    bytes: number;
    /** Path written to. */
    source: string;
    /** True when we created a brand-new file (no prior YAML). */
    created: boolean;
}
/**
 * Apply a partial patch to the on-disk YAML and rewrite. The patch can be
 * arbitrarily nested; missing keys are left alone (deep merge). Returns the
 * fully-resolved config for callers who want to re-broadcast.
 */
export declare function patchConfig(home: ResolvedHome, patch: Record<string, unknown>): Promise<PatchConfigResult>;
//# sourceMappingURL=writer.d.ts.map
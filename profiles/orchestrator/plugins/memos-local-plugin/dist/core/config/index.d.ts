/**
 * Public entry point for `core/config/`.
 *
 *   loadConfig(home)  → reads home.configFile, deep-merges over defaults,
 *                       validates with the schema, returns a frozen object.
 *   resolveConfig(raw)→ same merge + validate, but starting from an arbitrary
 *                       raw object (used by adapters that build config in code).
 *
 * Anything that needs to *write* config goes through `writer.ts`.
 */
import { Type } from "@sinclair/typebox";
import type { ResolvedHome } from "./paths.js";
import { type ResolvedConfig } from "./schema.js";
export type { ResolvedConfig } from "./schema.js";
export type { ResolvedHome } from "./paths.js";
export { resolveHome } from "./paths.js";
export { DEFAULT_CONFIG, SECRET_FIELD_PATHS } from "./defaults.js";
export interface LoadConfigResult {
    config: ResolvedConfig;
    /** Whether the config file existed; when false, defaults are returned. */
    fromDisk: boolean;
    /** Validation warnings (extra unknown keys, removed fields, …). */
    warnings: string[];
    /** Path that was read (or the path we *would* read on next save). */
    source: string;
}
export declare function loadConfig(home: ResolvedHome): Promise<LoadConfigResult>;
/**
 * Merge an arbitrary raw object over `DEFAULT_CONFIG` and validate. Used in
 * tests and by `writer.ts`. `warnings` is mutated in place if provided.
 */
export declare function resolveConfig(raw: unknown, warnings?: string[]): ResolvedConfig;
/**
 * One-shot helper for adapters that just want a fully resolved config for an
 * agent (handles both `MEMOS_HOME` overrides and the per-agent default).
 */
export declare function loadConfigForAgent(agent: string, defaultHome?: string): Promise<{
    home: ResolvedHome;
} & LoadConfigResult>;
export { Type };
//# sourceMappingURL=index.d.ts.map
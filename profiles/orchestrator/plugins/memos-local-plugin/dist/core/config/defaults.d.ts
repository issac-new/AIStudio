/**
 * The default config tree. Mirrors `schema.ts` exactly. When merging YAML,
 * we deep-merge over this tree so users only need to specify what they want
 * to change.
 */
import type { ResolvedConfig } from "./schema.js";
export declare const DEFAULT_CONFIG: ResolvedConfig;
/**
 * Set of dotted-path field names whose values must never be sent to the
 * viewer or any non-localhost surface. Used by `server/routes/config.ts`.
 */
export declare const SECRET_FIELD_PATHS: readonly string[];
//# sourceMappingURL=defaults.d.ts.map
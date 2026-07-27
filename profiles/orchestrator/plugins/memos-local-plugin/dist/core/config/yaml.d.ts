/**
 * Thin wrapper around the `yaml` package so the rest of `config/` doesn't
 * depend on it directly. Two responsibilities:
 *
 *   1. `parseYaml` — strict parse that surfaces line-precise errors as a
 *      `MemosError(CONFIG_INVALID, …)` so callers don't have to know about
 *      the underlying library.
 *   2. `parseDocument` — parse into a Document so the writer can preserve
 *      comments + ordering.
 */
import { type Document } from "yaml";
export declare function parseYaml<T = unknown>(text: string, source: string): T;
export declare function parseDoc(text: string, source: string): Document;
export { stringify as stringifyYaml } from "yaml";
//# sourceMappingURL=yaml.d.ts.map
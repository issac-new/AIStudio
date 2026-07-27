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
import { parse, parseDocument } from "yaml";
import { MemosError } from "../../agent-contract/errors.js";
export function parseYaml(text, source) {
    try {
        return parse(text);
    }
    catch (err) {
        const e = err;
        const at = e.linePos?.[0];
        const where = at ? ` (at ${source}:${at.line}:${at.col})` : ` (in ${source})`;
        throw new MemosError("config_invalid", `failed to parse YAML${where}: ${e.message}`, {
            source,
            ...(at ? { line: at.line, column: at.col } : {}),
        });
    }
}
export function parseDoc(text, source) {
    try {
        const doc = parseDocument(text, { keepSourceTokens: true });
        if (doc.errors.length > 0) {
            const first = doc.errors[0];
            const at = first.linePos?.[0];
            const where = at ? ` (at ${source}:${at.line}:${at.col})` : ` (in ${source})`;
            throw new MemosError("config_invalid", `YAML errors${where}: ${first.message}`, {
                source,
                ...(at ? { line: at.line, column: at.col } : {}),
            });
        }
        return doc;
    }
    catch (err) {
        if (MemosError.is(err))
            throw err;
        const e = err;
        throw new MemosError("config_invalid", `failed to parse YAML (${source}): ${e.message}`, { source });
    }
}
export { stringify as stringifyYaml } from "yaml";
//# sourceMappingURL=yaml.js.map
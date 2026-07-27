/**
 * Level helpers. Re-exports the canonical level enum from the contract layer
 * and provides comparisons + per-channel resolution.
 */
import { LOG_LEVELS, LOG_LEVEL_ORDER, } from "../../agent-contract/log-record.js";
export { LOG_LEVELS, LOG_LEVEL_ORDER };
export function levelGte(a, b) {
    return LOG_LEVEL_ORDER[a] >= LOG_LEVEL_ORDER[b];
}
export function isValidLevel(s) {
    return LOG_LEVELS.includes(s);
}
export function parseLevel(s, fallback = "info") {
    return isValidLevel(s) ? s : fallback;
}
/**
 * Resolve the effective level for `channel` given the global level and a
 * channel→level overrides map. Longest-prefix wins; fall back to global.
 *
 *   overrides = { "core.l2": "debug", "core.l2.cross-task": "trace" }
 *   resolveLevelForChannel("core.l2.cross-task", "info", overrides) === "trace"
 *   resolveLevelForChannel("core.l2.incremental", "info", overrides) === "debug"
 *   resolveLevelForChannel("core.session", "info", overrides) === "info"
 */
export function resolveLevelForChannel(channel, globalLevel, overrides) {
    let best = null;
    for (const [prefix, raw] of Object.entries(overrides ?? {})) {
        if (channel === prefix || channel.startsWith(prefix + ".")) {
            const lvl = parseLevel(raw, globalLevel);
            if (!best || prefix.length > best.len)
                best = { len: prefix.length, lvl };
        }
    }
    return best ? best.lvl : globalLevel;
}
//# sourceMappingURL=levels.js.map
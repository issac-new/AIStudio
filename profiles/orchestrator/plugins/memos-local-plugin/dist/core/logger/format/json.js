/**
 * Strict JSON formatter. One line per record. Used by file transports and the
 * SSE broadcast.
 */
export function formatJson(record) {
    return safeStringify(record) + "\n";
}
/**
 * `JSON.stringify` that survives circular references and unrepresentable
 * values. We never let a logging call crash.
 */
function safeStringify(value) {
    const seen = new WeakSet();
    return JSON.stringify(value, (_k, v) => {
        if (typeof v === "bigint")
            return v.toString();
        if (typeof v === "function")
            return `[function ${v.name || "anonymous"}]`;
        if (v instanceof Error) {
            return { name: v.name, message: v.message, stack: v.stack };
        }
        if (v && typeof v === "object") {
            if (seen.has(v))
                return "[circular]";
            seen.add(v);
        }
        return v;
    });
}
//# sourceMappingURL=json.js.map
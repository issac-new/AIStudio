/**
 * Lightweight refusal detector for model outputs that should never be
 * persisted as learned memory. Providers may expose structured refusal
 * signals, but our JSON facade only sees text at many call sites.
 */
const REFUSAL_PREFIXES = [
    { label: "I am Claude", re: /^i am claude\b/ },
    { label: "I'm Claude", re: /^i(?:'|’)m claude\b/ },
    { label: "As Claude", re: /^as claude\b/ },
    {
        label: "As an AI assistant created by Anthropic",
        re: /^as an ai assistant created by anthropic\b/,
    },
    { label: "As an AI assistant", re: /^as an ai (?:assistant|language model)\b/ },
    { label: "I'm sorry", re: /^i(?:'|’)m sorry(?:,| but)?\s+(?:i\s+)?(?:can(?:not|(?:'|’)t)|am unable to)\b/ },
    { label: "I apologize", re: /^i apologize(?:,| but)?\s+(?:i\s+)?(?:can(?:not|(?:'|’)t)|am unable to)\b/ },
    {
        label: "I cannot",
        re: /^i (?:can(?:not|(?:'|’)t)|am unable to)\s+(?:assist|help|fulfill|process|comply|provide|engage)\b/,
    },
    { label: "I do not feel comfortable", re: /^i do not feel comfortable\b/ },
    { label: "I do not actually have the ability", re: /^i do not actually have the ability\b/ },
];
export function detectModelRefusal(value) {
    for (const text of collectStrings(value)) {
        const match = detectModelRefusalText(text);
        if (match)
            return match;
    }
    return null;
}
export function detectModelRefusalText(text) {
    const content = excerpt(text);
    const normalized = normalizeOpening(content);
    for (const prefix of REFUSAL_PREFIXES) {
        if (prefix.re.test(normalized)) {
            return { matchedPrefix: prefix.label, content };
        }
    }
    return null;
}
function collectStrings(value) {
    if (typeof value === "string")
        return [value];
    if (Array.isArray(value))
        return value.flatMap(collectStrings);
    if (!value || typeof value !== "object")
        return [];
    return Object.values(value).flatMap(collectStrings);
}
function normalizeOpening(text) {
    return text
        .trim()
        .replace(/^[\uFEFF\s"'“”‘’`*_>-]+/, "")
        .replace(/[’]/g, "'")
        .toLowerCase();
}
function excerpt(text) {
    return text.replace(/\s+/g, " ").trim().slice(0, 1000);
}
//# sourceMappingURL=refusal.js.map
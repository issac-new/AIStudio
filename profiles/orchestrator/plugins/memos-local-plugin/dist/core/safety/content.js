/**
 * Helpers for LLM-derived display text.
 *
 * Raw turns stay intact for audit/replay. These helpers are for structured
 * memory artifacts that the LLM synthesizes and that we later display or
 * inject back into model context.
 */
const HTML_BLOCK_RE = /<\s*(script|style|iframe|object|embed|svg|math|template)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi;
const DANGEROUS_TAG_RE = /<\/?\s*(script|style|iframe|object|embed|svg|math|template)\b[^>]*>/gi;
const HTML_TAG_RE = /<\/?[a-z][a-z0-9:-]*(?:\s+[^<>]*)?>/gi;
const CONTROL_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const MARKDOWN_LINK_RE = /(!?)\[([^\]\n]*)\]\(((?:\\.|[^()\n]|\([^()\n]*\))+)\)/g;
export function sanitizeDerivedText(value) {
    const text = value == null ? "" : String(value);
    return stripDangerousMarkdownLinks(stripUnsafeHtml(text))
        .replace(CONTROL_RE, "")
        .trim();
}
export function sanitizeDerivedMarkdown(value) {
    const text = value == null ? "" : String(value);
    return stripDangerousMarkdownLinks(stripDangerousHtmlBlocks(text))
        .replace(CONTROL_RE, "")
        .trim();
}
export function sanitizeDerivedList(values) {
    const out = [];
    for (const value of values) {
        const cleaned = sanitizeDerivedText(value);
        if (cleaned)
            out.push(cleaned);
    }
    return out;
}
export function sanitizeDerivedMarkdownList(values) {
    const out = [];
    for (const value of values) {
        const cleaned = sanitizeDerivedMarkdown(value);
        if (cleaned)
            out.push(cleaned);
    }
    return out;
}
export function stripDangerousMarkdownLinks(text) {
    return text.replace(MARKDOWN_LINK_RE, (_match, bang, label, rawUrl) => {
        const url = rawUrl.trim();
        const firstToken = url.split(/\s+/)[0] ?? "";
        if (!isSafeLinkTarget(firstToken)) {
            return `${bang}${label}`;
        }
        return `${bang}[${label}](${url})`;
    });
}
export function isSafeLinkTarget(raw) {
    const target = raw.trim().replace(/^["'<]+|[>"']+$/g, "");
    if (!target)
        return false;
    if (target.startsWith("#") || target.startsWith("/") || target.startsWith("./") || target.startsWith("../")) {
        return true;
    }
    try {
        const url = new URL(target);
        return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:";
    }
    catch {
        return false;
    }
}
function stripUnsafeHtml(text) {
    return text
        .replace(HTML_BLOCK_RE, "")
        .replace(HTML_TAG_RE, "");
}
function stripDangerousHtmlBlocks(text) {
    return text.replace(HTML_BLOCK_RE, "").replace(DANGEROUS_TAG_RE, "");
}
//# sourceMappingURL=content.js.map
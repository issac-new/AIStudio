/**
 * Request-body and response-writing helpers.
 *
 * Keep these minimal — we don't want to accidentally re-implement a
 * web framework. Handlers return plain objects; `writeJson` takes care
 * of stringification + content-type + status.
 */
export async function readBody(req, maxBytes) {
    if (req.method === "GET" || req.method === "HEAD")
        return Buffer.alloc(0);
    const chunks = [];
    let total = 0;
    for await (const chunk of req) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += buf.length;
        if (total > maxBytes) {
            throw new Error(`body exceeds max size (${maxBytes} bytes)`);
        }
        chunks.push(buf);
    }
    return Buffer.concat(chunks);
}
export function parseJsonBody(body) {
    if (body.length === 0)
        return {};
    return JSON.parse(body.toString("utf8"));
}
export function writeJson(res, status, payload) {
    const body = JSON.stringify(payload);
    res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
    res.end(body);
}
export function writeText(res, status, text, contentType = "text/plain; charset=utf-8") {
    res.writeHead(status, { "content-type": contentType });
    res.end(text);
}
export function writeNotFound(res) {
    writeJson(res, 404, { error: { code: "not_found", message: "not found" } });
}
export function writeMethodNotAllowed(res, method) {
    writeJson(res, 405, {
        error: { code: "method_not_allowed", message: `${method} not allowed here` },
    });
}
//# sourceMappingURL=io.js.map
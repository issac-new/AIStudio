import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
export function makeSharedToken() {
    return base64url(randomBytes(24));
}
export function issueUserToken(payload, secret, ttlMs = 24 * 60 * 60 * 1000) {
    const full = { ...payload, exp: Date.now() + ttlMs };
    const body = base64url(JSON.stringify(full));
    return `${body}.${sign(body, secret)}`;
}
export function verifyUserToken(token, secret) {
    const idx = token.lastIndexOf(".");
    if (idx <= 0)
        return null;
    const body = token.slice(0, idx);
    const sig = token.slice(idx + 1);
    const expected = sign(body, secret);
    try {
        if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected)))
            return null;
        const parsed = JSON.parse(unbase64url(body).toString("utf8"));
        if (!parsed.userId || parsed.exp < Date.now())
            return null;
        return {
            userId: parsed.userId,
            username: parsed.username,
            role: parsed.role,
            status: parsed.status,
        };
    }
    catch {
        return null;
    }
}
function sign(value, secret) {
    return base64url(createHmac("sha256", secret).update(value).digest());
}
function base64url(input) {
    return Buffer.from(input)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
}
function unbase64url(input) {
    const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((input.length + 3) % 4);
    return Buffer.from(padded, "base64");
}
//# sourceMappingURL=auth.js.map
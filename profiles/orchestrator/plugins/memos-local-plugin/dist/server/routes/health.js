/**
 * Health + status endpoints.
 *
 * Kept boring on purpose — viewer polls these at 1–5s intervals, so
 * any allocation here compounds. The `health()` call on the core is
 * expected to be O(1) (cached).
 */
export function registerHealthRoutes(routes, deps) {
    const serviceIdentity = {
        service: "memos-local-plugin",
    };
    routes.set("GET /api/v1/health", async () => {
        const health = await deps.core.health();
        const bridge = deps.bridgeStatus?.();
        const identity = {
            ...serviceIdentity,
            agent: health.agent,
        };
        return bridge ? { ...health, ...identity, bridge } : { ...health, ...identity };
    });
    routes.set("GET /api/v1/ping", () => ({ ok: true, ...serviceIdentity, ts: Date.now() }));
    void {};
}
//# sourceMappingURL=health.js.map
import { parseJson, writeError } from "./registry.js";
export function registerConfigRoutes(routes, deps) {
    routes.set("GET /api/v1/config", async () => {
        return await deps.core.getConfig();
    });
    routes.set("PATCH /api/v1/config", async (ctx) => {
        const patch = parseJson(ctx);
        if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
            writeError(ctx, 400, "invalid_argument", "body must be a JSON object");
            return;
        }
        return await deps.core.patchConfig(patch);
    });
}
//# sourceMappingURL=config.js.map
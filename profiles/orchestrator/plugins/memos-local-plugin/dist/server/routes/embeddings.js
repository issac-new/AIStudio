/**
 * Embedding maintenance endpoints.
 *
 * The viewer uses these after importing memories or changing embedding
 * providers/models so stored vectors are consistent with the current model.
 */
import { parseJson } from "./registry.js";
export function registerEmbeddingRoutes(routes, deps) {
    routes.set("GET /api/v1/embeddings/maintenance", async () => {
        return await deps.core.embeddingMaintenanceStats();
    });
    routes.set("POST /api/v1/embeddings/rebuild", async (ctx) => {
        const body = parseJson(ctx);
        return await deps.core.rebuildEmbeddings(body);
    });
}
//# sourceMappingURL=embeddings.js.map
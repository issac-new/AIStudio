/**
 * Embedding maintenance endpoints.
 *
 * The viewer uses these after importing memories or changing embedding
 * providers/models so stored vectors are consistent with the current model.
 */
import { type Routes } from "./registry.js";
import type { ServerDeps } from "../types.js";
export declare function registerEmbeddingRoutes(routes: Routes, deps: ServerDeps): void;
//# sourceMappingURL=embeddings.d.ts.map
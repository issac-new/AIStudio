/**
 * Config read/write endpoints.
 *
 *   GET   /api/v1/config    → current resolved `config.yaml` with
 *                             sensitive fields masked as `"••••"`.
 *   PATCH /api/v1/config    → deep-merge a partial object into
 *                             `config.yaml`. Secrets left as `""` or
 *                             `"••••"` are ignored (so the UI can
 *                             rehydrate the form without wiping keys).
 *
 * Writes go through `core/config/writer.ts::patchConfig`, which
 * preserves comments + field order and re-applies `chmod 600`.
 */
import type { ServerDeps } from "../types.js";
import { type Routes } from "./registry.js";
export declare function registerConfigRoutes(routes: Routes, deps: ServerDeps): void;
//# sourceMappingURL=config.d.ts.map
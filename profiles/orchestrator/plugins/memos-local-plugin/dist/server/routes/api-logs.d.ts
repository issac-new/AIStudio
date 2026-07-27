/**
 * `GET /api/v1/api-logs` — paged listing of the structured `api_logs`
 * table (defined in the squashed initial schema). Fuels the viewer's
 * Logs page which renders rich per-tool templates for `memos_search`
 * and `memory_add`.
 *
 * Query parameters:
 *   - `tool`    optional tool-name filter (e.g. `memos_search`)
 *   - `tools`   optional comma-separated tool-name filter
 *   - `limit`   default 50, capped server-side at 500
 *   - `offset`  default 0
 *
 * Response:
 *   { logs: ApiLogDTO[], total: number, limit, offset, nextOffset? }
 */
import type { ServerDeps } from "../types.js";
import type { Routes } from "./registry.js";
export declare function registerApiLogsRoutes(routes: Routes, deps: ServerDeps): void;
//# sourceMappingURL=api-logs.d.ts.map
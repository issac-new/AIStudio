/**
 * Live log stream (SSE) + tail endpoint.
 *
 * - `GET /api/v1/logs/tail?n=200` — returns the most recent N logs
 *   as JSON. Used on initial page load before the SSE attaches.
 * - `GET /api/v1/logs` — SSE stream of every `LogRecord` post
 *   redaction. Always applies server-side rate limiting (see
 *   `ALGORITHMS.md` §S4).
 */
import type { ServerDeps, ServerOptions } from "../types.js";
import type { Routes } from "./registry.js";
export declare function registerLogsRoutes(routes: Routes, deps: ServerDeps, options: ServerOptions): void;
//# sourceMappingURL=logs.d.ts.map
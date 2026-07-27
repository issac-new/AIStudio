/**
 * Memory query endpoints.
 *
 * All of these are read-only projections of core state. The viewer
 * uses them to render the timeline, trace details, and search box.
 * Write-side turn-lifecycle operations live in `session.ts` +
 * `events.ts`.
 */
import type { ServerDeps, ServerOptions } from "../types.js";
import { type Routes } from "./registry.js";
export declare function registerMemoryRoutes(routes: Routes, deps: ServerDeps, options?: ServerOptions): void;
//# sourceMappingURL=memory.d.ts.map
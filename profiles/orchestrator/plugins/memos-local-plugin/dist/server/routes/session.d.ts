/**
 * Session + episode lifecycle endpoints.
 *
 * The server is a thin wrapper around `MemoryCore` here. Each method
 * maps 1:1 to the equivalent JSON-RPC call in `bridge/methods.ts`, so
 * the web viewer and an external JSON-RPC client see the same shape.
 */
import type { ServerDeps } from "../types.js";
import { type Routes } from "./registry.js";
export declare function registerSessionRoutes(routes: Routes, deps: ServerDeps): void;
//# sourceMappingURL=session.d.ts.map
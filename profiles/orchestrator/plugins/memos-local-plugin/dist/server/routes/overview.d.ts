/**
 * Aggregated overview endpoint.
 *
 * The viewer's Overview tab wants a single payload describing the
 * rough state of the system: how many memories (traces), tasks
 * (episodes), experiences (L2 policies), environment knowledge
 * entries (L3 world models), and skills. We compose this from
 * existing `MemoryCore` methods so the core contract doesn't have to
 * grow an "overview" method.
 *
 * The response also includes the `health()` block so the frontend
 * header and overview share one payload shape — no schema changes on
 * either side when we add a new metric (e.g. model names).
 */
import type { ServerDeps } from "../types.js";
import type { Routes } from "./registry.js";
export declare function registerOverviewRoutes(routes: Routes, deps: ServerDeps): void;
//# sourceMappingURL=overview.d.ts.map
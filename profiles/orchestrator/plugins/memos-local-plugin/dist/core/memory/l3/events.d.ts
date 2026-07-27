/**
 * `createL3EventBus` — mirror of `core/memory/l2/events.ts` for the L3
 * pipeline. One bus per orchestrator; listeners get typed delivery +
 * wildcard channel, and any listener error is logged but does not leak.
 */
import type { L3EventBus } from "./types.js";
export declare function createL3EventBus(): L3EventBus;
//# sourceMappingURL=events.d.ts.map
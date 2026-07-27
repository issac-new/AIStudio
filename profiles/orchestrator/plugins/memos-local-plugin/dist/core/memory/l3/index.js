/**
 * `core/memory/l3` — cross-task world-model abstraction.
 *
 * This module is the callable surface for the rest of `core/`:
 *   - `runL3` / `adjustConfidence`: imperative entry points.
 *   - `attachL3Subscriber`: wire L3 into the event pipeline.
 *   - `createL3EventBus`: the typed event channel L3 emits on.
 *   - Types/DTOs used by the viewer + adapters.
 *
 * See `README.md` and `ALGORITHMS.md` for the why/how.
 */
export { abstractDraft, buildWorldModelRow } from "./abstract.js";
export { clusterPolicies, domainKeyOf } from "./cluster.js";
export { createL3EventBus } from "./events.js";
export { adjustConfidence, runL3 } from "./l3.js";
export { chooseMergeTarget, gatherMergeCandidates, mergeForUpdate, } from "./merge.js";
export { attachL3Subscriber } from "./subscriber.js";
//# sourceMappingURL=index.js.map
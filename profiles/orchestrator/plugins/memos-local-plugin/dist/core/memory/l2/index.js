/**
 * Public API for `core/memory/l2` — cross-task L2 policy induction &
 * association (V7 §2.4.1 + §2.4.5).
 *
 * Keep this surface minimal:
 *   - the orchestrator (`runL2`),
 *   - the subscriber bridge from the reward pipeline,
 *   - the event bus factory,
 *   - the types callers actually consume.
 *
 * Internal helpers (signature hashing, similarity math) stay module-private.
 */
export { runL2 } from "./l2.js";
export { attachL2Subscriber, } from "./subscriber.js";
export { createL2EventBus } from "./events.js";
export { signatureOf, parseSignature, componentsOf, bucketKeyOf } from "./signature.js";
export { tracePolicySimilarity, valueWeightedMean, arithmeticMeanValue, centroid, } from "./similarity.js";
export { induceDraft, buildPolicyRow } from "./induce.js";
export { computeGain, nextStatus, applyGain, partition } from "./gain.js";
export { makeCandidatePool, candidateIdFor, signatureHash } from "./candidate-pool.js";
//# sourceMappingURL=index.js.map
/**
 * `core/memory/l2` — types.
 *
 * The L2 pipeline maps a freshly-settled episode (reward already applied) to
 * zero or more operations on the `policies` + `l2_candidate_pool` tables:
 *
 * 1. **Associate** — for every trace with V > 0, look up nearby `active` L2
 *    policies by cosine. If one matches and shares the signature, bump its
 *    `support`, recompute `gain`, possibly retire on consistent negative
 *    delta.
 * 2. **Candidate** — for traces that *don't* match any L2, drop them into
 *    `l2_candidate_pool` keyed by their signature (see `signature.ts`).
 * 3. **Induce** — when ≥ 2 traces from **different** episodes share a
 *    candidate-pool signature, call the `l2.induction` prompt and mint a
 *    new `candidate` policy + embedding.
 *
 * All shapes below are *internal* to `core/memory/l2`; they are re-exported
 * selectively by `index.ts`.
 */
export {};
//# sourceMappingURL=types.js.map
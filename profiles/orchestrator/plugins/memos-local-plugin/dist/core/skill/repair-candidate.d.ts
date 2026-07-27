/**
 * Repair candidates — minting an unproven skill from a *constructive negative*.
 *
 * A failed episode whose feedback named a concrete fix produces a negative
 * policy that also carries the suggested fix as a `decisionGuidance.preference`
 * (see `feedback-builder.ts`). That policy is NOT skill-eligible through the
 * normal `hasSuccessAnchor` gate — and it should not be: the fix is unverified.
 *
 * Instead we mint it directly as a **candidate** skill with:
 *   - `eta = REPAIR_CANDIDATE_INITIAL_ETA` (just at the retrieval floor — visible
 *     enough to be tried, zero success credit), and
 *   - `repairOrigin = true` (uses the stricter promotion bar; surfaced as
 *     "unverified" in retrieval), and
 *   - `strictTrial` stamped from the source (verifier origin → full-pass-only
 *     trial judging; soft feedback → loose).
 *
 * It earns trust the same way every other candidate does — via `skill_trials`
 * resolved by the real re-run outcome — and is deduped against the normal
 * crystallization path through `sourcePolicyIds` (a later positive feedback
 * rebuilds *this* skill rather than minting a second one).
 *
 * No LLM call: the policy already carries refined guidance, so this works in
 * the no-LLM fallback path too (unlike `crystallizeDraft`).
 */
import type { Embedder } from "../embedding/types.js";
import type { Logger } from "../logger/types.js";
import type { Repos } from "../storage/repos/index.js";
import type { PolicyRow, SkillId, TraceId } from "../types.js";
import type { SkillConfig } from "./types.js";
/**
 * Q3: born at the retrieval floor — visible enough to be tried, no head start.
 * MUST stay ≥ `retrieval.minSkillEta` / `skill.minEtaForRetrieval` (both default
 * 0.1): tier-1 hides skills with `eta < minSkillEta`, so a candidate born below
 * the floor would never surface, never get a trial, and never validate. Keep
 * this aligned if that floor is raised.
 */
export declare const REPAIR_CANDIDATE_INITIAL_ETA = 0.1;
export interface MintRepairCandidateDeps {
    repos: Pick<Repos, "skills" | "embeddingRetryQueue" | "traces" | "episodes">;
    config: Pick<SkillConfig, "evidenceLimit">;
    embedder: Embedder | null;
    now?: () => number;
    log?: Logger;
}
/**
 * A constructive negative: a failure (negative polarity, not skill-eligible)
 * whose feedback named a concrete fix (a non-empty `preference`). That fix is
 * the repair we mint as a candidate.
 */
export declare function isRepairCandidatePolicy(policy: PolicyRow): boolean;
/**
 * Strict when the source carried an objective all-or-nothing verifier signal —
 * those trials must judge by full credit only (Q2). Soft-feedback origin → loose.
 */
export declare function deriveStrictTrial(policy: PolicyRow): boolean;
/**
 * Mint a candidate repair skill from a constructive-negative policy. Returns the
 * new skill id, or null when the policy is not a repair candidate or a skill
 * already cites it (the normal rebuild path owns updates from then on).
 */
export declare function mintRepairCandidate(policy: PolicyRow, deps: MintRepairCandidateDeps): SkillId | null;
export declare function selectRepairEvidenceAnchors(policy: PolicyRow, deps: Pick<MintRepairCandidateDeps, "repos" | "config">): TraceId[];
//# sourceMappingURL=repair-candidate.d.ts.map
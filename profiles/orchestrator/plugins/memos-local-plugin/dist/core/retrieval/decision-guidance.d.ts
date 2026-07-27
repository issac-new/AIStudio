/**
 * V7 §2.4.6 — collect decision guidance for the current retrieval.
 *
 * Inputs:
 *   - Ranked Tier-2 trace candidates (we use their `episodeId` to find
 *     the policies that share evidence with the trace).
 *   - Ranked Tier-1 skill candidates. When a skill carries its own
 *     `procedureJson.decisionGuidance`, that skill-local guidance is
 *     authoritative; we only fall back to source policies for legacy
 *     skills without embedded guidance.
 *
 * Output: a deduped list of `{ preference, antiPattern, sourcePolicyIds/sourceSkillIds }`
 * entries, ordered by frequency-of-attachment then alphabetically.
 *
 * Why dedupe at this stage and not later: a policy may surface against
 * multiple retrieved traces (typical when several traces share an
 * episode), and its `@repair {…}` block is a single coherent unit; we
 * never want to inject the same "Avoid: don't run sed -i on macOS" three
 * times.
 *
 * This is intentionally a pure function — no LLM, no network, no IO
 * beyond what the repos do. Cheap to call on every retrieval.
 */
import type { RankedCandidate } from "./ranker.js";
import type { RetrievalRepos } from "./types.js";
/**
 * One displayable guidance line. `kind` decides which list it goes
 * into ("preference" → 偏好 / "antiPattern" → 反模式).
 *
 * We carry `sourcePolicyIds` so the viewer (and future logs panel) can
 * link each guidance line back to the policies that justify it.
 */
export interface GuidanceLine {
    kind: "preference" | "antiPattern";
    text: string;
    sourcePolicyIds: string[];
    sourceSkillIds: string[];
}
/** What the injector needs — small, easy to render. */
export interface CollectedGuidance {
    preference: GuidanceLine[];
    antiPattern: GuidanceLine[];
    /** Policy ids consulted (for debug / logs). */
    policyIdsTouched: string[];
    /** Skill ids that contributed embedded decision guidance. */
    skillIdsTouched: string[];
}
export interface CollectInput {
    ranked: ReadonlyArray<RankedCandidate>;
    repos: RetrievalRepos;
    /** Cap on entries kept in each list. Default 3 each — keeps prompt small. */
    perListCap?: number;
}
export declare function collectDecisionGuidance(input: CollectInput): CollectedGuidance;
//# sourceMappingURL=decision-guidance.d.ts.map
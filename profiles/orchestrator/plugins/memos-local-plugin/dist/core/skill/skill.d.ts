/**
 * V7 §2.5 — Skill crystallization orchestrator.
 *
 * High-level flow (also drawn in `ALGORITHMS.md`):
 *
 *   1. gather candidate policies (`policyId` hint OR all active policies).
 *   2. evaluate eligibility via `eligibility.ts` — per-policy verdict.
 *   3. for each `crystallize` or `rebuild` decision:
 *        a. pull evidence traces.
 *        b. call `SKILL_CRYSTALLIZE_PROMPT` → normalised draft.
 *        c. run `verifier.verifyDraft` — heuristic consistency check.
 *        d. build a `SkillRow` via `packager.buildSkillRow`.
 *        e. upsert into `skills`. Emit `skill.crystallized`.
 *        f. if verified & trials not already met → status stays
 *           `candidate`; if the rebuild supersedes an existing active
 *           skill, new rows always start as `candidate` so they're
 *           re-tested before surfacing.
 *   4. emit a rollup event (`skill.eligibility.checked`).
 *
 * The orchestrator never mutates state on its own; every write is a
 * repo.upsert call that the transaction wrapper keeps atomic.
 */
import type { Embedder } from "../embedding/types.js";
import type { LlmClient } from "../llm/types.js";
import type { Logger } from "../logger/types.js";
import type { Repos } from "../storage/repos/index.js";
import type { SkillId, SkillRow } from "../types.js";
import type { RunSkillInput, RunSkillResult, SkillConfig, SkillEventBus, SkillFeedbackKind } from "./types.js";
export interface RunSkillDeps {
    repos: Repos;
    embedder: Embedder | null;
    llm: LlmClient | null;
    log: Logger;
    bus: SkillEventBus;
    config: SkillConfig;
}
export declare function runSkill(input: RunSkillInput, deps: RunSkillDeps): Promise<RunSkillResult>;
/**
 * Apply one feedback signal to an existing skill and emit the appropriate
 * events. Used by the subscriber on explicit user feedback and by the
 * orchestrator on trial outcomes.
 */
export declare function applySkillFeedback(skillId: SkillId, kind: SkillFeedbackKind, deps: RunSkillDeps, magnitude?: number): SkillRow | null;
//# sourceMappingURL=skill.d.ts.map
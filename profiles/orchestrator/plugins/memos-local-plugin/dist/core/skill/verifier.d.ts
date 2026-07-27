/**
 * V7 §2.5.3 — Consistency + integration verification for a freshly minted
 * skill.
 *
 * Two checks, both deterministic — no LLM calls:
 *
 * 1. **Tool coverage**: every tool name declared in `draft.tools` must
 *    appear in the evidence traces' structured `toolCalls`. Coverage is a
 *    simple set-containment check — `draft.tools ⊆ evidenceTools`. This
 *    catches the most common LLM hallucination: inventing tool/command
 *    names that never appeared in any evidence trace.
 *
 * 2. **Evidence resonance**: at least `minResonance` fraction of the
 *    evidence traces should share ≥ 2 tokens with the skill's summary or
 *    steps. Prevents a skill whose narrative contradicts the examples.
 *
 * The check returns a verdict; the caller (orchestrator) decides whether to
 * promote (active) or hold (candidate) and whether to emit a failure
 * event.
 */
import type { Logger } from "../logger/types.js";
import type { TraceRow } from "../types.js";
import type { SkillCrystallizationDraft } from "./types.js";
export interface VerifyInput {
    draft: SkillCrystallizationDraft;
    evidence: TraceRow[];
}
export interface VerifyDeps {
    log: Logger;
    /** Fraction of evidence that must resonate with the draft; default 0.5. */
    minResonance?: number;
}
export interface VerifyResult {
    ok: boolean;
    coverage: number;
    resonance: number;
    unmappedTokens: string[];
    reason?: string;
}
export declare function verifyDraft(input: VerifyInput, deps: VerifyDeps): VerifyResult;
//# sourceMappingURL=verifier.d.ts.map
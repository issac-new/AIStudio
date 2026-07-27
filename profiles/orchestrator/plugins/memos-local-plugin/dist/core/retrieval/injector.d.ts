/**
 * Snippet renderer.
 *
 * Converts `RankedCandidate`s into `InjectionSnippet` values + a single
 * rendered `InjectionPacket`. Adapters may walk `snippets` themselves or
 * just splice `rendered` verbatim into the host prompt.
 *
 * The rendering is intentionally plain-text (Markdown headings) — we don't
 * know yet how each adapter (OpenClaw vs Hermes) will format its prompt
 * section, so we stick to a neutral shape that they can either tweak or
 * wrap.
 */
import type { EpisodeId, EpochMs, InjectionPacket, InjectionSnippet, RetrievalReason, SessionId } from "../../agent-contract/dto.js";
import type { CollectedGuidance } from "./decision-guidance.js";
import type { RankedCandidate } from "./ranker.js";
import type { RankedSnippet, TierCandidate } from "./types.js";
export type SkillInjectionMode = "summary" | "full";
export interface InjectorInput {
    ranked: readonly RankedCandidate[];
    reason: RetrievalReason;
    tierLatencyMs: {
        tier1: number;
        tier2: number;
        tier3: number;
    };
    now: EpochMs;
    /**
     * Required so the packet can be correlated with `onTurnEnd` /
     * decision-repair calls on the adapter side. When we add a retrieval
     * entry point that has no session context (e.g. a CLI preview),
     * synthesise an id before calling.
     */
    sessionId: SessionId;
    episodeId: EpisodeId;
    /**
     * How Tier-1 skill candidates should be rendered. Defaults to
     * `"summary"` — a short descriptor + `memos_skill_get(id="…")` invocation
     * hint, so the host model decides whether to pull the full guide.
     */
    skillInjectionMode?: SkillInjectionMode;
    /** Per-skill summary char cap when `skillInjectionMode === "summary"`. */
    skillSummaryChars?: number;
    /**
     * V7 §2.4.6 — preference / anti-pattern collected from policies that
     * share evidence with the retrieved traces / skills. Rendered as a
     * dedicated "Decision guidance" section so the agent reads it BEFORE
     * choosing its next action. Empty (default) means no guidance was
     * found for the current retrieval — the section is then omitted.
     */
    decisionGuidance?: CollectedGuidance;
    /**
     * Standalone math final-answer turns are usually single-shot: the host
     * model rarely follows up with `memos_skill_get`, and weakly matched
     * method memories can distract from the problem statement. Render these
     * packets as advisory method recall rather than established user facts.
     */
    standaloneMathFinalAnswer?: boolean;
    /**
     * Deterministic task protocol inferred by core retrieval from the current
     * prompt shape. This is adapter-agnostic and complements retrieved memory;
     * when no historical snippets match, the host still receives the protocol.
     */
    taskProtocol?: string | null;
    /** IR domain only: prepend built-in search playbook before packet body. */
    domain?: "" | "ir";
}
export interface InjectorResult {
    packet: InjectionPacket;
    /** One-to-one with `packet.snippets`, carrying the debug origin. */
    mapping: RankedSnippet[];
}
export declare function toPacket(input: InjectorInput): InjectorResult;
/**
 * Public snippet renderer used by `llm-filter.ts` when it needs to
 * surface the LLM-dropped candidates back on the packet (for the Logs
 * page's `droppedByLlm` list). Reuses the same renderer as the
 * injected packet so the two views stay visually consistent.
 *
 * Skills are always rendered in `summary` mode here — the dropped list
 * is purely informational and we don't want oversized guides eating the
 * Logs view either.
 */
export declare function renderSnippetForDebug(c: TierCandidate): InjectionSnippet | null;
//# sourceMappingURL=injector.d.ts.map
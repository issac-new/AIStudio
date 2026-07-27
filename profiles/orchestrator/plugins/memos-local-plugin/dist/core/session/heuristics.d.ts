/**
 * Rule-based fast path for `IntentClassifier`.
 *
 * Each rule is a pure function (text) → HeuristicMatch | null so the
 * classifier can report exactly which rules fired ("signals"). Callers
 * that want to inspect decisions (the frontend viewer, audit logs) get a
 * traceable reason.
 *
 * The rules here are intentionally conservative — they only fire on
 * obvious cases. The hybrid classifier escalates ambiguous input to
 * an LLM when one is configured.
 */
import type { IntentKind } from "./types.js";
export interface HeuristicRule {
    id: string;
    kind: IntentKind;
    confidence: number;
    /** Short label for logs / frontend badges. */
    label: string;
    match(text: string): boolean;
}
export interface HeuristicMatch {
    rule: HeuristicRule;
    kind: IntentKind;
    confidence: number;
}
export declare const HEURISTIC_RULES: HeuristicRule[];
export declare function matchFirst(text: string, rules?: HeuristicRule[]): HeuristicMatch | null;
/**
 * Pure utility — derive the retrieval-tier flags from an intent kind. Exposed
 * so non-classifier callers (tests, adapters that hardcode one kind) can stay
 * in sync with the classifier's own wiring.
 */
export declare function retrievalFor(kind: IntentKind): {
    tier1: boolean;
    tier2: boolean;
    tier3: boolean;
};
//# sourceMappingURL=heuristics.d.ts.map
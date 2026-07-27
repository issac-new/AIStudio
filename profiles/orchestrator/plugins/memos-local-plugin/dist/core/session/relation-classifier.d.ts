import type { LlmClient } from "../llm/index.js";
import type { RelationDecision, RelationInput, TurnRelation } from "./types.js";
export interface RelationClassifierOptions {
    llm?: LlmClient;
    timeoutMs?: number;
    /** Skip LLM path (tests / offline mode). */
    disableLlm?: boolean;
}
export interface RelationClassifier {
    classify(input: RelationInput): Promise<RelationDecision>;
}
export declare function createRelationClassifier(opts?: RelationClassifierOptions): RelationClassifier;
/** Exposed for audit / frontend display. */
export declare function listRelationRules(): ReadonlyArray<{
    id: string;
    kind: TurnRelation;
    label: string;
}>;
//# sourceMappingURL=relation-classifier.d.ts.map
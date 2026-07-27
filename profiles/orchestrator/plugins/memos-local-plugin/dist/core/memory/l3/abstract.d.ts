/**
 * Step 2 of the L3 pipeline — **call the LLM abstractor** on a cluster
 * of compatible L2 policies and return a ready-to-persist draft.
 *
 * Pure abstraction logic: no DB writes, no events. The caller decides
 * whether to insert a new WM or merge into an existing one.
 */
import type { LlmClient } from "../../llm/index.js";
import type { Logger } from "../../logger/types.js";
import type { EpisodeId, PolicyId, TraceRow, WorldModelId, WorldModelRow } from "../../types.js";
import type { L3AbstractionDraft, L3AbstractionDraftResult, L3Config, PolicyCluster } from "./types.js";
export interface AbstractInput {
    cluster: PolicyCluster;
    /** Evidence traces per policy id (caller resolves these via traces repo). */
    evidenceByPolicy: Map<PolicyId, readonly TraceRow[]>;
    /**
     * Episode that triggered this L3 run, when known. Forwarded to the
     * LLM call so the resulting `system_model_status` audit row can be
     * grouped with the rest of that episode's pipeline activity in the
     * Logs viewer.
     */
    episodeId?: EpisodeId;
}
export interface AbstractDeps {
    llm: LlmClient | null;
    log: Logger;
    config: Pick<L3Config, "policyCharCap" | "traceCharCap" | "traceEvidencePerPolicy" | "useLlm">;
    /** Optional extra validation executed after the base validator. */
    validate?: (d: L3AbstractionDraft) => void;
}
export declare function abstractDraft(input: AbstractInput, deps: AbstractDeps): Promise<L3AbstractionDraftResult>;
export declare function buildWorldModelRow(args: {
    draft: L3AbstractionDraft;
    cluster: PolicyCluster;
    episodeIds: readonly EpisodeId[];
    inducedBy: string;
    now?: number;
    id?: WorldModelId;
}): WorldModelRow;
//# sourceMappingURL=abstract.d.ts.map
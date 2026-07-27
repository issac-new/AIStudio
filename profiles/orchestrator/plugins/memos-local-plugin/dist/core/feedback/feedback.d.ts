/**
 * V7 §2.4.6 — Decision Repair orchestrator.
 *
 * Entry points:
 *
 *   - `runRepair(input, deps)` — imperative API. Called by the subscriber
 *     whenever a failure burst is detected or a user message is classified
 *     as `negative` / `preference`.
 *
 *   - `attachRepairToPolicies(draft, deps)` — append the draft's
 *     preference / anti-pattern onto the `decisionGuidance` field of each
 *     referenced policy. Only runs when `config.attachToPolicy === true`.
 *
 * The orchestrator never mutates state on its own unless it decides to
 * persist: every write is a single atomic insert into `decision_repairs`
 * plus, optionally, per-policy `update`s. Failures are always scoped:
 * logged, emitted as `repair.skipped`, and the orchestrator returns a
 * skip result.
 */
import type { Embedder } from "../embedding/types.js";
import type { LlmClient } from "../llm/types.js";
import type { Logger } from "../logger/types.js";
import type { Repos } from "../storage/repos/index.js";
import type { PolicyId } from "../types.js";
import type { DecisionRepairDraft, FeedbackConfig, FeedbackEventBus, RepairInput, RepairResult } from "./types.js";
export interface RepairDeps {
    repos: Repos;
    llm: LlmClient | null;
    embedder: Embedder | null;
    bus: FeedbackEventBus;
    log: Logger;
    config: FeedbackConfig;
}
export declare function runRepair(input: RepairInput, deps: RepairDeps): Promise<RepairResult>;
export interface AttachDeps {
    repos: Repos;
    log: Logger;
}
/**
 * Append the repair draft's preference / anti-pattern onto the candidate
 * policies' decision_guidance metadata. Returns the list of policy IDs
 * that were actually updated.
 */
export declare function attachRepairToPolicies(draft: DecisionRepairDraft, deps: AttachDeps): PolicyId[];
//# sourceMappingURL=feedback.d.ts.map
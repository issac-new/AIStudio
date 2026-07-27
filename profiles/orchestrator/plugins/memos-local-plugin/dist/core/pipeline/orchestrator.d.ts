/**
 * `createPipeline` — the single orchestrator.
 *
 * Responsibilities (V7 §0.2, §0.3, §0.5):
 *
 *   • Maintain the session / episode lifecycle. Each `onTurnStart` opens a
 *     new episode (carrying the intent classifier's decision forward). We
 *     keep the default "one user query = one episode" and leave the
 *     revision-vs-new-task split to a future iteration; today every
 *     assistant response finalizes its episode at `onTurnEnd`, which in
 *     turn kicks off the capture → reward → L2 → L3 → skill chain.
 *
 *   • Own all event buses and aggregate them into a single
 *     `CoreEvent` stream for the facade's `subscribeEvents` surface.
 *
 *   • Provide retrieval entry points for every V7 injection trigger
 *     (`turn_start`, `tool_driven`, `skill_invoke`, `sub_agent`,
 *     `decision_repair`). Packet shape is always the adapter-contract
 *     `InjectionPacket`.
 *
 *   • Forward tool-call outcomes to the feedback subscriber so the
 *     failure burst detector can schedule repairs autonomously.
 *
 * The orchestrator is single-process and holds in-memory references to
 * the current open episode per session. Adapters can still inspect the
 * session manager directly for richer queries.
 */
import type { PipelineDeps, PipelineHandle } from "./types.js";
export declare function createPipeline(deps: PipelineDeps): PipelineHandle;
//# sourceMappingURL=orchestrator.d.ts.map